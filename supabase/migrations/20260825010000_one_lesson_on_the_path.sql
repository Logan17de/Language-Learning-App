-- A lesson that was never opened still has to leave the path.
--
-- Retirement was driven entirely by the lesson_sessions trigger, which retires
-- an assignment when its session is abandoned. A lesson that was generated and
-- assigned but never opened has no session, so nothing ever fired for it and it
-- stayed on the path indefinitely.
--
-- Learn resumes the newest unfinished assignment, so those queue up behind the
-- lesson in front. Finish the current lesson and the next-oldest never-opened
-- one takes its place -- a lesson from weeks earlier presented as the one to
-- carry on with. One learner had five stacked up, the oldest from July, each
-- waiting its turn to be handed back.
--
-- Opening a lesson now retires every other unfinished assignment, not only the
-- ones that happen to have a session. That is the rule the rest of the product
-- already states: one lesson at a time, so one entry on the path.
--
-- This rewrite carries the two properties the function has gained since it was
-- last replaced, and must keep: the per-learner advisory lock that serializes
-- takeover, and clock_timestamp() so simultaneous opens order by wall clock
-- rather than sharing the transaction's start time.

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

  -- The lesson being opened is on the path, whatever it was before. The
  -- sync_lesson_assignment_status trigger only promotes an assignment that is
  -- still 'assigned', so a lesson retired by the sweep below and opened again
  -- afterwards would play while missing from Learn -- which is how the earlier
  -- stranded row came about. Being in a lesson decides this, not the order the
  -- learner happened to open things in.
  update public.lesson_assignments
  set status = 'started',
      started_at = coalesce(started_at, v_session.started_at),
      updated_at = clock_timestamp()
  where user_id = v_user
    and lesson_id = p_lesson_id
    and status <> 'completed';

  -- And every other lesson leaves the path, including one that was never
  -- opened. The session trigger cannot reach those: with no session, there is
  -- no status change for it to fire on.
  update public.lesson_assignments
  set status = 'abandoned', updated_at = clock_timestamp()
  where user_id = v_user
    and lesson_id <> p_lesson_id
    and status in ('assigned', 'started');

  return to_jsonb(v_session);
end;
$$;

revoke all on function public.start_or_resume_lesson_session(uuid, uuid) from public, anon;
grant execute on function public.start_or_resume_lesson_session(uuid, uuid)
  to authenticated, service_role;

comment on function public.start_or_resume_lesson_session(uuid, uuid) is
  'Opens one lesson session for the learner, resuming only a still-open session, and leaves one lesson on their path.';

-- ---------------------------------------------------------------------------
-- Clear the backlog: an unfinished assignment with a newer one behind it was
-- superseded at the moment that newer lesson was created.
-- ---------------------------------------------------------------------------
update public.lesson_assignments stale
set status = 'abandoned',
    updated_at = now()
where stale.status in ('assigned', 'started')
  and exists (
    select 1
    from public.lesson_assignments newer
    where newer.user_id = stale.user_id
      and newer.selection_mode = 'custom_topic'
      and newer.assigned_at > stale.assigned_at
  );

do $$
declare
  v_worst integer;
begin
  select coalesce(max(waiting), 0) into v_worst
  from (
    select count(*) as waiting
    from public.lesson_assignments
    where status in ('assigned', 'started')
    group by user_id
  ) counts;

  if v_worst > 1 then
    raise exception 'a learner may have only one lesson on their path, found %', v_worst;
  end if;

  -- The properties this rewrite had to preserve, asserted rather than assumed.
  if position('pg_advisory_xact_lock' in pg_get_functiondef(
       'public.start_or_resume_lesson_session(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'lesson takeover must stay serialized per learner';
  end if;
  if position('clock_timestamp' in pg_get_functiondef(
       'public.start_or_resume_lesson_session(uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'lesson takeover must stay ordered by wall clock';
  end if;
end
$$;
