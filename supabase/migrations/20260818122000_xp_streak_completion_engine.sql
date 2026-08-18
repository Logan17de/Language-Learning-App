-- Canonical lesson rewards for the six-phase learner flow.
-- XP is calculated by the database, and streak dates use the learner's timezone.

create or replace function public.calculate_lesson_xp(p_score integer)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select 50 + greatest(0, least(100, p_score));
$$;

revoke all on function public.calculate_lesson_xp(integer) from public;

comment on function public.calculate_lesson_xp(integer) is
  'Returns canonical lesson XP: 50 completion XP plus a clamped 0-100 lesson score.';

create or replace function public.complete_lesson_session(
  p_session_id uuid,
  p_score integer,
  p_xp integer,
  p_duration_minutes integer,
  p_completion_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_ledger public.reward_ledger%rowtype;
  v_result jsonb;
  v_completion_data jsonb;
  v_xp integer;
  v_timezone text;
  v_today date;
  v_last_activity_date date;
  v_current_streak integer;
  v_new_streak integer;
begin
  if p_score not between 0 and 100
     or p_duration_minutes not between 0 and 1440 then
    raise exception 'Invalid completion metrics' using errcode = '22023';
  end if;

  if jsonb_typeof(p_completion_data) <> 'object' then
    raise exception 'Completion data is required' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.lesson_sessions
  where id = p_session_id
  for update;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  -- Reward ledger makes completion idempotent. Repeating the same completion
  -- returns the original canonical result without adding XP or streak again.
  select *
  into v_ledger
  from public.reward_ledger
  where reward_type = 'lesson'
    and source_id = p_session_id;

  if found then
    return v_ledger.canonical_result;
  end if;

  if v_session.status <> 'active' then
    raise exception 'Session is not active' using errcode = '55000';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_session.user_id
  for update;

  if not found then
    raise exception 'Learner profile not found' using errcode = 'P0002';
  end if;

  -- p_xp remains in the function signature only so previously deployed clients
  -- can keep calling this RPC. It is deliberately ignored: clients do not own XP.
  v_xp := public.calculate_lesson_xp(p_score);

  v_timezone := coalesce(nullif(btrim(v_profile.timezone), ''), 'UTC');
  begin
    v_today := (now() at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    v_timezone := 'UTC';
    v_today := (now() at time zone 'UTC')::date;
  end;

  select max(activity_date)
  into v_last_activity_date
  from public.weekly_activity
  where user_id = v_session.user_id;

  v_current_streak := greatest(0, coalesce(v_profile.streak_days, 0));
  v_new_streak := case
    when v_last_activity_date = v_today
      then greatest(v_current_streak, 1)
    when v_last_activity_date = v_today - 1
      then v_current_streak + 1
    else 1
  end;

  v_completion_data := p_completion_data || jsonb_build_object(
    'canonicalXp', v_xp,
    'xpEngineVersion', 'lesson-v1',
    'activityDate', v_today,
    'activityTimezone', v_timezone
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'lesson_id', v_session.lesson_id,
    'lesson_version_id', v_session.lesson_version_id,
    'score', p_score,
    'xp_awarded', v_xp,
    'streak_days', v_new_streak,
    'activity_date', v_today,
    'rewarded', true
  );

  insert into public.lesson_completions (
    user_id,
    lesson_id,
    lesson_version_id,
    lesson_session_id,
    score,
    xp_awarded,
    duration_minutes,
    completion_data
  ) values (
    v_session.user_id,
    v_session.lesson_id,
    v_session.lesson_version_id,
    p_session_id,
    p_score,
    v_xp,
    p_duration_minutes,
    v_completion_data
  )
  on conflict (lesson_session_id) do nothing;

  insert into public.reward_ledger (
    user_id,
    reward_type,
    source_id,
    xp_awarded,
    canonical_result
  ) values (
    v_session.user_id,
    'lesson',
    p_session_id,
    v_xp,
    v_result
  )
  on conflict (reward_type, source_id) do nothing
  returning * into v_ledger;

  if not found then
    select *
    into v_ledger
    from public.reward_ledger
    where reward_type = 'lesson'
      and source_id = p_session_id;
    return v_ledger.canonical_result;
  end if;

  update public.lesson_sessions
  set status = 'completed',
      completed_at = now(),
      reward_claimed_at = now()
  where id = p_session_id;

  update public.profiles
  set xp = xp + v_xp,
      streak_days = v_new_streak,
      longest_streak = greatest(longest_streak, v_new_streak),
      total_study_minutes = total_study_minutes + p_duration_minutes
  where id = v_session.user_id;

  insert into public.weekly_activity (
    user_id,
    activity_date,
    minutes,
    lesson_minutes
  ) values (
    v_session.user_id,
    v_today,
    p_duration_minutes,
    p_duration_minutes
  )
  on conflict (user_id, activity_date) do update
  set minutes = public.weekly_activity.minutes + excluded.minutes,
      lesson_minutes = public.weekly_activity.lesson_minutes + excluded.lesson_minutes;

  return v_result;
end;
$$;

comment on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb) is
  'Completes a six-phase lesson idempotently, awards server-owned XP, and advances the learner-local-day streak. p_xp is ignored for compatibility.';
