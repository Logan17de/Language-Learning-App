-- One lesson open at a time, decided by the server.
--
-- Nothing ever closed a session. abandonActive() was written for it and called
-- from nowhere, so sessions accumulated: one learner held thirteen at once,
-- the oldest from four weeks earlier, and none abandoned. The product only ever
-- offers a single Resume, so twelve of those were invisible and unreachable
-- while still counting as open.
--
-- It shows up as strangeness across two browsers because each one starts its
-- own session and keeps its own local copy of where it had got to, and the two
-- read back differently. Starting a lesson is therefore resolved here, in one
-- statement, rather than by a read-then-write from whichever browser got there
-- first.
--
-- Returning to an earlier lesson reactivates the session it already had. That
-- pairing matters: abandoning without it would mean a learner who switched
-- lessons and came back found their progress replaced by a fresh session.

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

  -- The session this lesson already has, whatever state it was left in, so
  -- coming back resumes rather than restarts. A finished lesson is never
  -- reopened; it starts again from the beginning.
  select * into v_session
  from public.lesson_sessions
  where user_id = v_user
    and lesson_id = p_lesson_id
    and status <> 'completed'
  order by started_at desc
  limit 1
  for update;

  if found then
    if v_session.status <> 'active' then
      update public.lesson_sessions
      set status = 'active', updated_at = now()
      where id = v_session.id
      returning * into v_session;
    end if;
  else
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
  -- answer to "which lesson am I on" no matter which browser asks.
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
  'Opens one lesson session for the learner, resuming the lesson''s own session and closing any other.';

-- ---------------------------------------------------------------------------
-- Close what has already piled up, keeping the one most recently started.
-- ---------------------------------------------------------------------------
update public.lesson_sessions stale
set status = 'abandoned', updated_at = now()
where stale.status = 'active'
  and stale.id <> (
    select keep.id
    from public.lesson_sessions keep
    where keep.user_id = stale.user_id and keep.status = 'active'
    order by keep.started_at desc
    limit 1
  );

do $$
declare
  v_worst integer;
begin
  select coalesce(max(open), 0) into v_worst
  from (
    select count(*) as open
    from public.lesson_sessions
    where status = 'active'
    group by user_id
  ) counts;

  if v_worst > 1 then
    raise exception 'a learner may hold only one open lesson, found %', v_worst;
  end if;
  if not has_function_privilege(
    'authenticated', 'public.start_or_resume_lesson_session(uuid, uuid)', 'EXECUTE'
  ) then
    raise exception 'a learner must be able to open their lesson';
  end if;
end
$$;
