-- An unfinished lesson is a consumed assignment, not a resumable lesson.
-- Once the learner explicitly leaves an active lesson, that lesson must never
-- become their "next lesson" again. Mastery evidence already recorded remains.

alter table public.lesson_assignments
  drop constraint if exists lesson_assignments_status_check;

alter table public.lesson_assignments
  add constraint lesson_assignments_status_check
  check (status in ('assigned', 'started', 'completed', 'abandoned'));

create or replace function public.sync_lesson_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'lesson_sessions' then
    if new.status = 'abandoned' then
      update public.lesson_assignments
      set status = 'abandoned',
          updated_at = now()
      where user_id = new.user_id
        and lesson_id = new.lesson_id
        and lesson_version_id = new.lesson_version_id
        and status in ('assigned', 'started');
    elsif new.status = 'active' then
      update public.lesson_assignments
      set status = 'started',
          started_at = coalesce(started_at, new.started_at),
          updated_at = now()
      where user_id = new.user_id
        and lesson_id = new.lesson_id
        and lesson_version_id = new.lesson_version_id
        and status = 'assigned';
    end if;
  else
    update public.lesson_assignments
    set status = 'completed',
        completed_at = new.completed_at,
        updated_at = now()
    where user_id = new.user_id
      and lesson_id = new.lesson_id
      and status <> 'completed';
  end if;

  return new;
end
$$;

-- Existing insert trigger still marks a newly started lesson as started.
-- Add the missing update trigger so explicit lesson abandonment retires the
-- assignment at the same moment the session becomes abandoned.
drop trigger if exists lesson_session_assignment_abandoned
  on public.lesson_sessions;
create trigger lesson_session_assignment_abandoned
after update of status on public.lesson_sessions
for each row
when (old.status is distinct from new.status)
execute function public.sync_lesson_assignment_status();

-- Repair assignments left behind by the old behavior. Only retire a started
-- assignment when it has an abandoned session and no active session remains.
update public.lesson_assignments as assignment
set status = 'abandoned',
    updated_at = now()
where assignment.status = 'started'
  and exists (
    select 1
    from public.lesson_sessions as abandoned_session
    where abandoned_session.user_id = assignment.user_id
      and abandoned_session.lesson_id = assignment.lesson_id
      and abandoned_session.lesson_version_id = assignment.lesson_version_id
      and abandoned_session.status = 'abandoned'
  )
  and not exists (
    select 1
    from public.lesson_sessions as active_session
    where active_session.user_id = assignment.user_id
      and active_session.lesson_id = assignment.lesson_id
      and active_session.lesson_version_id = assignment.lesson_version_id
      and active_session.status = 'active'
  );

comment on function public.sync_lesson_assignment_status() is
  'Keeps lesson assignment lifecycle aligned with lesson sessions. Abandoned lessons are retired and never selected again.';
