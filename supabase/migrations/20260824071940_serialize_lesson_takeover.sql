-- Serialize lesson ownership changes for one learner.
--
-- The takeover function already makes a later lesson final and retires the
-- lesson it replaces. Two requests can still arrive at almost the same time,
-- however. A transaction-scoped advisory lock makes those requests take turns
-- for the same learner, so the request that reaches the lock last is the single
-- authoritative active lesson.

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

  -- One user owns one lesson slot. Requests for different users remain fully
  -- concurrent, while two browsers belonging to this user are ordered.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (
    select 1 from public.profiles
    where id = v_user and status = 'active'
  ) then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select * into v_session
  from public.lesson_sessions
  where user_id = v_user
    and lesson_id = p_lesson_id
    and status = 'active'
  order by started_at desc
  limit 1
  for update;

  if not found then
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

  update public.lesson_sessions
  set status = 'abandoned', updated_at = now()
  where user_id = v_user
    and status = 'active'
    and id <> v_session.id;

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.start_or_resume_lesson_session(uuid, uuid)
  from public, anon;
grant execute on function public.start_or_resume_lesson_session(uuid, uuid)
  to authenticated, service_role;

comment on function public.start_or_resume_lesson_session(uuid, uuid) is
  'Serializes lesson ownership per learner, resumes only the active lesson, and permanently sets aside the lesson it replaces.';
