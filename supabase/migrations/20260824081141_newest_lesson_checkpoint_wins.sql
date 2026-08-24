-- The newest lesson owns the learner's one writable checkpoint.
--
-- A checkpoint used to be a direct table UPDATE. That had two problems:
--   1. an old compatibility trigger ran for every modern session and could
--      mistake the generated Story hand-off for an old-client phase commit;
--   2. the write could only fail when a takeover race left the newest session
--      abandoned -- it could not atomically restore the newer session and
--      retire the older one.
--
-- Keep the old trigger for the server-owned rollout cohort only, and put the
-- modern checkpoint write behind one short, per-learner transaction. Session
-- creation time is the authority: the newest session may replace an older
-- active row, while an older tab can never take the slot back.

-- now() is fixed for the lifetime of a transaction. That makes two lesson
-- openings inside one transaction indistinguishable by started_at, even though
-- the advisory lock has established a clear request order. Use wall-clock time
-- for the ownership timestamp so the request that opens second is always newer.
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
  v_opened_at timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

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

    v_opened_at := clock_timestamp();
    insert into public.lesson_sessions (
      user_id, lesson_id, lesson_version_id, status, current_phase,
      current_phase_index, activity_index, elapsed_seconds, checkpoint,
      started_at, last_saved_at
    ) values (
      v_user, p_lesson_id, p_lesson_version_id, 'active', 'story',
      0, 0, 0, '{}'::jsonb, v_opened_at, v_opened_at
    )
    returning * into v_session;
  end if;

  update public.lesson_sessions
  set status = 'abandoned', updated_at = clock_timestamp()
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

create or replace function public.commit_legacy_checkpoint_phases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_completed jsonb;
  v_phase text;
begin
  if pg_trigger_depth() > 1
     or auth.uid() is null
     or new.status <> 'active'
     or not exists (
       select 1
       from public.lesson_legacy_checkpoint_sessions legacy
       where legacy.lesson_session_id = new.id
     ) then
    return new;
  end if;

  v_completed := case
    when jsonb_typeof(new.checkpoint -> 'session' -> 'completedPhaseIds') = 'array'
      then new.checkpoint -> 'session' -> 'completedPhaseIds'
    else '[]'::jsonb
  end;

  if v_completed = '[]'::jsonb then
    return new;
  end if;

  foreach v_phase in array v_phase_order loop
    if v_completed ? v_phase
       and not exists (
         select 1
         from public.lesson_phase_mastery_commits commit
         where commit.lesson_session_id = new.id
           and commit.phase = v_phase
       ) then
      if v_phase = 'reading' then
        perform public.commit_reading_phase(new.id, true);
      else
        perform public.commit_lesson_phase(new.id, v_phase);
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.commit_legacy_checkpoint_phases()
  from public, anon, authenticated, service_role;

create or replace function public.save_authoritative_lesson_checkpoint(
  p_session_id uuid,
  p_current_phase text,
  p_current_phase_index integer,
  p_activity_index integer,
  p_elapsed_seconds integer,
  p_checkpoint jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target public.lesson_sessions%rowtype;
  v_newest_id uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_checkpoint) <> 'object' then
    raise exception 'Lesson checkpoint must be an object' using errcode = '22023';
  end if;

  -- start_or_resume_lesson_session uses the same lock. Open and save therefore
  -- agree on one order even when two tabs arrive at the same moment.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  if not exists (
    select 1 from public.profiles
    where id = v_user and status = 'active'
  ) then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select * into v_target
  from public.lesson_sessions
  where id = p_session_id
    and user_id = v_user
  for update;

  if not found then
    raise exception 'Lesson session unavailable' using errcode = '42501';
  end if;

  select id into v_newest_id
  from public.lesson_sessions
  where user_id = v_user
  order by started_at desc, created_at desc, id desc
  limit 1
  for update;

  if v_newest_id is distinct from v_target.id then
    raise exception 'A newer lesson owns this checkpoint'
      using errcode = '42501';
  end if;

  if v_target.status = 'completed' then
    raise exception 'Completed lesson checkpoint is final'
      using errcode = '55000';
  end if;

  -- If an older request won a previous race, retire it first so the unique
  -- active-session constraint is never violated, then restore the genuinely
  -- newest session. The status trigger removes the older assignment.
  update public.lesson_sessions
  set status = 'abandoned',
      updated_at = now()
  where user_id = v_user
    and status = 'active'
    and id <> v_target.id;

  update public.lesson_sessions
  set status = 'active',
      current_phase = p_current_phase,
      current_phase_index = p_current_phase_index,
      activity_index = p_activity_index,
      elapsed_seconds = p_elapsed_seconds,
      checkpoint = p_checkpoint,
      last_saved_at = now(),
      updated_at = now()
  where id = v_target.id
  returning * into v_target;

  -- A session that was briefly abandoned also had its assignment retired.
  -- Put only this newest lesson back on the path.
  update public.lesson_assignments
  set status = 'started',
      started_at = coalesce(started_at, v_target.started_at),
      updated_at = now()
  where user_id = v_user
    and lesson_id = v_target.lesson_id
    and lesson_version_id = v_target.lesson_version_id
    and status = 'abandoned';

  return to_jsonb(v_target);
end;
$$;

revoke all on function public.save_authoritative_lesson_checkpoint(
  uuid, text, integer, integer, integer, jsonb
) from public, anon, service_role;
grant execute on function public.save_authoritative_lesson_checkpoint(
  uuid, text, integer, integer, integer, jsonb
) to authenticated;

comment on function public.save_authoritative_lesson_checkpoint(
  uuid, text, integer, integer, integer, jsonb
) is
  'Atomically saves only the learner newest lesson session, restoring it over an older active session when necessary.';

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.save_authoritative_lesson_checkpoint(uuid,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'authenticated learners must be able to save the authoritative checkpoint';
  end if;

  if has_function_privilege(
    'anon',
    'public.save_authoritative_lesson_checkpoint(uuid,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'anonymous clients must not save lesson checkpoints';
  end if;
end
$$;
