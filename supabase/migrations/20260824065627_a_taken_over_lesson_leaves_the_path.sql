-- Being taken over is final: the lesson left behind leaves the learner's path.
--
-- One lesson open at a time already closed the other session, but the closing
-- was reversible. Every retry from the browser still sitting on the old lesson
-- called start_or_resume_lesson_session again, which reopened it and closed the
-- new one in turn, so two browsers could trade the open slot back and forth and
-- neither settled. Production shows the damage plainly: "The King at the Park"
-- holds an active session while its assignment reads abandoned, because a retry
-- reopened the session after the trigger had already retired the assignment,
-- and nothing puts an assignment back. The lesson was live and unreachable at
-- the same time.
--
-- So a closed session is now closed for good. Only an already-active session is
-- resumed; a lesson that was set aside is refused with a reason the learner can
-- read, and the assignment stays retired, which is what takes it out of Learn.
-- Mastery is untouched: it lives in the phase commits, which are earned per
-- section and never depended on the session staying open.

create or replace function public.start_or_resume_lesson_session(
  p_lesson_id uuid,
  p_lesson_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.lesson_sessions%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_user and status = 'active'
  ) then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  -- Only a session that is still open is resumed. Reopening a closed one is
  -- what let two browsers take the slot from each other.
  select * into v_session
  from public.lesson_sessions
  where user_id = v_user
    and lesson_id = p_lesson_id
    and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found then
    -- Set aside by a later lesson. Say so rather than quietly starting over:
    -- a fresh session here would drop the learner back to the first section of
    -- a lesson they had half finished, and take the newer lesson down with it.
    if exists (
      select 1 from public.lesson_sessions
      where user_id = v_user
        and lesson_id = p_lesson_id
        and status = 'abandoned'
    ) then
      raise exception 'This lesson was set aside when another lesson was opened'
        using errcode = '42501';
    end if;

    insert into public.lesson_sessions (
      user_id, lesson_id, lesson_version_id, status, current_phase,
      current_phase_index, activity_index, elapsed_seconds, checkpoint,
      started_at, last_saved_at
    ) values (
      v_user, p_lesson_id, p_lesson_version_id, 'active', 'story',
      0, 0, 0, '{}'::jsonb, now(), now()
    )
    returning * into v_session;
  end if;

  -- Everything else the learner had open is closed, so there is exactly one
  -- answer to "which lesson am I on" no matter which browser asks. The
  -- lesson_session_assignment_abandoned trigger retires those assignments,
  -- which is what removes the lesson from Learn.
  update public.lesson_sessions
  set status = 'abandoned', updated_at = now()
  where user_id = v_user
    and status = 'active'
    and id <> v_session.id;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.start_or_resume_lesson_session(uuid, uuid) from public, anon;
grant execute on function public.start_or_resume_lesson_session(uuid, uuid)
  to authenticated, service_role;

comment on function public.start_or_resume_lesson_session(uuid, uuid) is
  'Opens one lesson session for the learner, resuming only a still-open session and closing any other.';

-- ---------------------------------------------------------------------------
-- Put back the lessons that are open but missing from their learner's path.
--
-- These are the ping-pong casualties: the session was reopened after the
-- assignment had been retired, and only the session half recovered.
-- ---------------------------------------------------------------------------
update public.lesson_assignments assignment
set status = 'started',
    started_at = coalesce(assignment.started_at, open_session.started_at),
    updated_at = now()
from public.lesson_sessions open_session
where open_session.user_id = assignment.user_id
  and open_session.lesson_id = assignment.lesson_id
  and open_session.status = 'active'
  and assignment.status = 'abandoned';

do $$
declare
  v_stranded integer;
begin
  select count(*) into v_stranded
  from public.lesson_sessions open_session
  join public.lesson_assignments assignment
    on assignment.user_id = open_session.user_id
   and assignment.lesson_id = open_session.lesson_id
  where open_session.status = 'active'
    and assignment.status = 'abandoned';

  if v_stranded > 0 then
    raise exception 'an open lesson may not be missing from its learner''s path, found %', v_stranded;
  end if;

  if not has_function_privilege(
    'authenticated', 'public.start_or_resume_lesson_session(uuid, uuid)', 'EXECUTE'
  ) then
    raise exception 'a learner must be able to open their lesson';
  end if;
end
$$;
