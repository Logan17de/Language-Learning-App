-- Daily creation entitlement and Resume discovery.
--
-- Free = 1 new lesson generation per learner-local day.
-- Paid = 5 new lesson generations per learner-local day.
-- Resume is independent of today's allowance and of the entitlement date.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(18);

-- ---------------------------------------------------------------------------
-- Fixture helpers. Each learner gets an isolated lesson so Resume discovery
-- cannot pick up another test's rows.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner(p_plan text)
returns uuid language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'quota-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set subscription_plan = p_plan::public.subscription_plan,
      status = 'active',
      timezone = 'UTC'
  where id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.make_lesson(p_user uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id, reusable
  ) values (
    v_lesson, 'quota-' || replace(v_lesson::text, '-', ''),
    'Quota fixture', '割当フィクスチャ', 'Hermetic fixture lesson.',
    'quota fixture', 'N5', 30, 'published', 'user_generated', p_user, false
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;
  return v_lesson;
end $$;

create or replace function pg_temp.add_request(
  p_user uuid, p_lesson uuid, p_local_date date, p_free boolean
) returns void language sql as $$
  insert into public.custom_lesson_requests (
    user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
    status, generated_lesson_id, matched_lesson_id,
    entitlement_local_date, entitlement_timezone,
    uses_free_daily_entitlement, entitlement_consumed_at
  ) values (
    p_user, 'quota fixture topic', 'N5', 30, 'balanced', 'medium',
    'approved', p_lesson, p_lesson, p_local_date, 'UTC',
    p_free, case when p_free then now() else null end
  );
$$;

create or replace function pg_temp.add_assignment(p_user uuid, p_lesson uuid, p_status text)
returns void language sql as $$
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
  )
  select p_user, p_lesson, lesson.current_version_id, 'custom_topic', p_status, 'quota-behavior-test'
  from public.lessons lesson where lesson.id = p_lesson;
$$;

create or replace function pg_temp.creation_state(p_user uuid)
returns jsonb language plpgsql as $$
declare v_state jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  select public.get_lesson_creation_state() into v_state;
  return v_state;
end $$;

-- ---------------------------------------------------------------------------
-- Free learner with no creations today.
-- ---------------------------------------------------------------------------
select set_config('aiko.free_fresh', pg_temp.make_learner('free')::text, true);

select is(
  (pg_temp.creation_state(current_setting('aiko.free_fresh')::uuid) ->> 'plan'),
  'free', 'Free learner reports the free plan');
select is(
  (pg_temp.creation_state(current_setting('aiko.free_fresh')::uuid) ->> 'daily_limit'),
  '1', 'Free daily limit is exactly 1');
select is(
  (pg_temp.creation_state(current_setting('aiko.free_fresh')::uuid) ->> 'creations_today'),
  '0', 'Free learner starts the day with no creations');
select is(
  (pg_temp.creation_state(current_setting('aiko.free_fresh')::uuid) ->> 'can_create'),
  'true', 'Free learner may create their one lesson');

-- ---------------------------------------------------------------------------
-- Free learner who already used today's single entitlement.
-- ---------------------------------------------------------------------------
select set_config('aiko.free_used', pg_temp.make_learner('free')::text, true);
select set_config('aiko.free_used_lesson',
  pg_temp.make_lesson(current_setting('aiko.free_used')::uuid)::text, true);
select pg_temp.add_request(
  current_setting('aiko.free_used')::uuid,
  current_setting('aiko.free_used_lesson')::uuid,
  (now() at time zone 'UTC')::date, true);

select is(
  (pg_temp.creation_state(current_setting('aiko.free_used')::uuid) ->> 'creations_today'),
  '1', 'Free learner has used one creation today');
select is(
  (pg_temp.creation_state(current_setting('aiko.free_used')::uuid) ->> 'can_create'),
  'false', 'Free learner cannot create a second lesson the same day');

-- ---------------------------------------------------------------------------
-- Paid learner limits: 4 today still allows a fifth, 5 today does not.
-- ---------------------------------------------------------------------------
select set_config('aiko.paid_four', pg_temp.make_learner('premium_monthly')::text, true);
select pg_temp.add_request(
    current_setting('aiko.paid_four')::uuid,
    pg_temp.make_lesson(current_setting('aiko.paid_four')::uuid),
    (now() at time zone 'UTC')::date, false)
from generate_series(1, 4);

select is(
  (pg_temp.creation_state(current_setting('aiko.paid_four')::uuid) ->> 'plan'),
  'premium', 'Paid learner reports the premium plan');
select is(
  (pg_temp.creation_state(current_setting('aiko.paid_four')::uuid) ->> 'daily_limit'),
  '5', 'Paid daily limit is exactly 5');
select is(
  (pg_temp.creation_state(current_setting('aiko.paid_four')::uuid) ->> 'creations_today'),
  '4', 'Paid learner has used four creations today');
select is(
  (pg_temp.creation_state(current_setting('aiko.paid_four')::uuid) ->> 'can_create'),
  'true', 'Paid learner may still create a fifth lesson');

select set_config('aiko.paid_five', pg_temp.make_learner('premium_monthly')::text, true);
select pg_temp.add_request(
    current_setting('aiko.paid_five')::uuid,
    pg_temp.make_lesson(current_setting('aiko.paid_five')::uuid),
    (now() at time zone 'UTC')::date, false)
from generate_series(1, 5);

select is(
  (pg_temp.creation_state(current_setting('aiko.paid_five')::uuid) ->> 'creations_today'),
  '5', 'Paid learner has used all five creations today');
select is(
  (pg_temp.creation_state(current_setting('aiko.paid_five')::uuid) ->> 'can_create'),
  'false', 'Paid learner cannot exceed five creations in one day');

-- ---------------------------------------------------------------------------
-- Resume is independent of today's allowance. A Free learner who has spent
-- today's single creation must still be offered their unfinished lesson.
-- ---------------------------------------------------------------------------
select set_config('aiko.free_resume', pg_temp.make_learner('free')::text, true);
select set_config('aiko.free_resume_lesson',
  pg_temp.make_lesson(current_setting('aiko.free_resume')::uuid)::text, true);
select pg_temp.add_request(
  current_setting('aiko.free_resume')::uuid,
  current_setting('aiko.free_resume_lesson')::uuid,
  (now() at time zone 'UTC')::date, true);
select pg_temp.add_assignment(
  current_setting('aiko.free_resume')::uuid,
  current_setting('aiko.free_resume_lesson')::uuid, 'started');

select is(
  (pg_temp.creation_state(current_setting('aiko.free_resume')::uuid) ->> 'can_create'),
  'false', 'Resume fixture has genuinely exhausted today''s allowance');
select is(
  (pg_temp.creation_state(current_setting('aiko.free_resume')::uuid) ->> 'resume_lesson_id'),
  current_setting('aiko.free_resume_lesson'),
  'Resume is offered even when today''s allowance is spent');

-- ---------------------------------------------------------------------------
-- A prior-day unfinished lesson stays resumable, and does not consume any of
-- today's allowance.
-- ---------------------------------------------------------------------------
select set_config('aiko.prior_day', pg_temp.make_learner('free')::text, true);
select set_config('aiko.prior_day_lesson',
  pg_temp.make_lesson(current_setting('aiko.prior_day')::uuid)::text, true);
select pg_temp.add_request(
  current_setting('aiko.prior_day')::uuid,
  current_setting('aiko.prior_day_lesson')::uuid,
  ((now() at time zone 'UTC')::date - 1), true);
select pg_temp.add_assignment(
  current_setting('aiko.prior_day')::uuid,
  current_setting('aiko.prior_day_lesson')::uuid, 'started');

select is(
  (pg_temp.creation_state(current_setting('aiko.prior_day')::uuid) ->> 'creations_today'),
  '0', 'Yesterday''s creation does not count against today');
select is(
  (pg_temp.creation_state(current_setting('aiko.prior_day')::uuid) ->> 'can_create'),
  'true', 'Free learner gets a fresh creation the next local day');
select is(
  (pg_temp.creation_state(current_setting('aiko.prior_day')::uuid) ->> 'resume_lesson_id'),
  current_setting('aiko.prior_day_lesson'),
  'A prior-day unfinished lesson is still resumable');

-- ---------------------------------------------------------------------------
-- An assignment that was generated but never started is resumable too, and a
-- completed lesson is not.
-- ---------------------------------------------------------------------------
select set_config('aiko.assigned', pg_temp.make_learner('free')::text, true);
select set_config('aiko.assigned_lesson',
  pg_temp.make_lesson(current_setting('aiko.assigned')::uuid)::text, true);
select pg_temp.add_assignment(
  current_setting('aiko.assigned')::uuid,
  current_setting('aiko.assigned_lesson')::uuid, 'assigned');

select is(
  (pg_temp.creation_state(current_setting('aiko.assigned')::uuid) ->> 'resume_lesson_id'),
  current_setting('aiko.assigned_lesson'),
  'A generated but unstarted lesson is resumable');
select is(
  (pg_temp.creation_state(current_setting('aiko.assigned')::uuid) ->> 'resume_lesson_state'),
  'ready', 'An unstarted resumable lesson reports the ready state');

select * from finish();
rollback;
