-- The /learn security boundary, table by table.
--
-- Two different mechanisms are deliberately in play, and this suite proves
-- each one where it belongs rather than forcing a single denial style:
--
--   * lesson_translation_questions is a HARD privilege denial. The browser
--     role has no table privilege at all, because model_answer is server-owned.
--   * Protected Listening and Speaking are an RLS decision. The browser role
--     holds base SELECT so the policy can run, and the policy is what separates
--     Free from Paid.
--   * lesson_sessions and the answer/event tables carry base privileges with
--     own-row RLS, because the browser reads and writes them directly.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(26);

-- ---------------------------------------------------------------------------
-- Fixture helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner(p_plan text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'sec-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set subscription_plan = p_plan::public.subscription_plan, status = 'active', timezone = 'UTC'
  where id = v_user;
  return v_user;
end $$;

-- A published lesson carrying protected Listening and Speaking content.
create or replace function pg_temp.make_lesson(p_user uuid)
returns uuid language plpgsql as $$
declare v_lesson uuid := gen_random_uuid(); v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'sec-' || replace(v_lesson::text, '-', ''),
    'Security fixture', '保護', 'Hermetic fixture lesson.',
    'security fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;

  insert into public.lesson_listening_activities (
    lesson_version_id, position, prompt, transcript, choices, correct_answer,
    explanation, difficulty
  )
  select v_version, i, 'Listening prompt ' || i, 'transcript',
         array['correct', 'wrong'], 'correct', 'explanation', 'easy'
  from generate_series(1, 5) i;

  insert into public.lesson_speaking_activities (
    lesson_version_id, position, mode, prompt, model_answer, question_type
  )
  select v_version, i, 'easy', 'Speaking prompt ' || i, '駅に行きます。', 'read_aloud'
  from generate_series(1, 5) i;

  return v_lesson;
end $$;

create or replace function pg_temp.visible_listening(p_user uuid, p_version uuid)
returns integer language plpgsql as $$
declare v_count integer;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select count(*)::integer into v_count
  from public.lesson_listening_activities where lesson_version_id = p_version;
  return v_count;
end $$;

create or replace function pg_temp.visible_speaking(p_user uuid, p_version uuid)
returns integer language plpgsql as $$
declare v_count integer;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select count(*)::integer into v_count
  from public.lesson_speaking_activities where lesson_version_id = p_version;
  return v_count;
end $$;

select set_config('aiko.free', pg_temp.make_learner('free')::text, true);
select set_config('aiko.paid', pg_temp.make_learner('premium_monthly')::text, true);
select set_config('aiko.paid_lesson',
  pg_temp.make_lesson(current_setting('aiko.paid')::uuid)::text, true);
select set_config('aiko.paid_version',
  (select current_version_id::text from public.lessons
   where id = current_setting('aiko.paid_lesson')::uuid), true);

-- ---------------------------------------------------------------------------
-- ACL matrix. These assertions pin the intended privilege surface so a future
-- migration cannot silently widen or narrow it.
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.lesson_sessions', 'SELECT')
  and has_table_privilege('authenticated', 'public.lesson_sessions', 'INSERT')
  and has_table_privilege('authenticated', 'public.lesson_sessions', 'UPDATE'),
  'lesson_sessions carries the base privileges the browser needs');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_sessions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.lesson_sessions', 'TRUNCATE'),
  'lesson_sessions cannot be deleted or truncated by the browser role');

select ok(
  has_table_privilege('authenticated', 'public.lesson_activity_answers', 'SELECT')
  and has_table_privilege('authenticated', 'public.lesson_activity_answers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_activity_answers', 'UPDATE'),
  'lesson_activity_answers is insert-once: answered questions are final');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_activity_answers', 'DELETE'),
  'answers cannot be deleted by the browser role');

select ok(
  has_table_privilege('authenticated', 'public.lesson_events', 'SELECT')
  and has_table_privilege('authenticated', 'public.lesson_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_events', 'UPDATE'),
  'lesson_events is insert-once: recorded events are final');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_events', 'DELETE'),
  'events cannot be deleted by the browser role');

-- Protected content: base SELECT is REQUIRED so that RLS is what decides.
select ok(
  has_table_privilege('authenticated', 'public.lesson_listening_activities', 'SELECT'),
  'Listening carries base SELECT so the Premium policy can be evaluated');
select ok(
  has_table_privilege('authenticated', 'public.lesson_speaking_activities', 'SELECT'),
  'Speaking carries base SELECT so the Premium policy can be evaluated');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_listening_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_listening_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lesson_listening_activities', 'DELETE'),
  'Listening content is not writable by the browser role');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_speaking_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_speaking_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lesson_speaking_activities', 'DELETE'),
  'Speaking content is not writable by the browser role');

-- Translation is the hard denial.
select ok(
  not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'SELECT'),
  'Translation questions are unreadable by the browser role');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'DELETE'),
  'Translation questions are unwritable by the browser role');
select ok(
  not has_table_privilege('anon', 'public.lesson_translation_questions', 'SELECT'),
  'Translation questions are unreadable by the anonymous role');

-- Mastery ledger.
select ok(
  has_table_privilege('authenticated', 'public.learner_mastery', 'SELECT')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'INSERT')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'DELETE')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'TRUNCATE'),
  'learner_mastery is readable but never writable by the browser role');
select ok(
  has_table_privilege('authenticated', 'public.learner_mastery_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'DELETE')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'TRUNCATE'),
  'learner_mastery_events is readable but never writable by the browser role');

-- Column-level profile contract: the learner edits preferences, not rewards.
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'timezone', 'UPDATE')
  and has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'learner may edit their own preference columns');
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'xp', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'streak_days', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'subscription_plan', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE'),
  'learner cannot edit XP, streak, plan or role');

-- ---------------------------------------------------------------------------
-- RLS decides Free vs Paid for protected practice.
-- ---------------------------------------------------------------------------
set local role authenticated;

select is(
  pg_temp.visible_speaking(current_setting('aiko.paid')::uuid,
                           current_setting('aiko.paid_version')::uuid),
  5, 'a Paid learner sees all five Speaking activities');
select is(
  pg_temp.visible_listening(current_setting('aiko.paid')::uuid,
                            current_setting('aiko.paid_version')::uuid),
  5, 'a Paid learner sees all five Listening activities');
select is(
  pg_temp.visible_listening(current_setting('aiko.free')::uuid,
                            current_setting('aiko.paid_version')::uuid),
  0, 'a Free learner sees no Listening activities');
select is(
  pg_temp.visible_speaking(current_setting('aiko.free')::uuid,
                           current_setting('aiko.paid_version')::uuid),
  0, 'a Free learner sees no Speaking activities');

-- Another learner's session is invisible, and the Translation table is a hard
-- privilege error rather than an empty result.
select set_config('request.jwt.claim.sub', current_setting('aiko.free'), true);

select throws_ok(
  'select count(*) from public.lesson_translation_questions',
  '42501', NULL,
  'reading Translation questions is a privilege error, not an empty result');

select is(
  (select count(*)::int from public.lessons
   where id = current_setting('aiko.paid_lesson')::uuid),
  0, 'a Free learner cannot see another learner''s generated lesson');

reset role;

-- ---------------------------------------------------------------------------
-- The retired assignment RPC is no longer reachable by learners.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.assign_next_lesson()', 'EXECUTE'),
  'the retired predefined-assignment RPC is not executable by learners');
select ok(
  has_function_privilege('authenticated', 'public.get_lesson_creation_state()', 'EXECUTE'),
  'the /learn creation-state RPC is executable by learners');
select ok(
  has_function_privilege('authenticated', 'public.commit_lesson_phase(uuid, text)', 'EXECUTE'),
  'the canonical phase commit RPC is executable by learners');

select * from finish();
rollback;
