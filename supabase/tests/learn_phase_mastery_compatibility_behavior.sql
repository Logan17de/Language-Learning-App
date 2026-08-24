-- Phase-atomic mastery, historical 10/13 compatibility, and idempotency.
--
-- Historical lesson versions may still hold 13 Vocabulary and 10-13 Grammar
-- physical rows. Only the canonical playable seven of each may influence phase
-- completion, mastery or reward. A partially answered phase commits nothing,
-- and committing the same phase twice must not pay out twice.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(47);

-- ---------------------------------------------------------------------------
-- Fixture helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'compat-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set subscription_plan = 'free', status = 'active', timezone = 'UTC'
  where id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.make_item()
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.grammar_records (id, pattern, meaning, formation, usage_notes, jlpt_level)
  values (v_id, 'compat-' || replace(v_id::text, '-', ''), 'fixture meaning',
          'fixture formation', 'fixture usage', 'N5');
  return v_id;
end $$;

-- A historical lesson: 13 physical Vocabulary rows and 13 physical Grammar
-- rows, well beyond the canonical playable seven of each.
create or replace function pg_temp.make_historical_lesson(p_user uuid, p_item uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'compat-' || replace(v_lesson::text, '-', ''),
    'Historical fixture', '互換', 'Hermetic historical fixture lesson.',
    'compat fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;

  insert into public.lesson_grammar (
    lesson_version_id, position, grammar_id, pattern, meaning, structure,
    usage_notes, example, translation, common_mistake
  ) values (
    v_version, 1, p_item, 'fixture pattern', 'fixture meaning', 'fixture structure',
    'fixture usage', '駅に行きます。', 'I go to the station.', 'fixture mistake'
  );

  insert into public.lesson_practice_activities (
    lesson_version_id, position, phase, activity_type, difficulty, mode, skill,
    prompt, correct_answer, accepted_answers, target_item_ids
  )
  select v_version, i, phase.name, 'multiple_choice', 'Easy', 'multiple-choice',
         'understanding', phase.name || ' prompt ' || i, 'correct',
         array['correct'], array[p_item]
  from generate_series(1, 13) i
  cross join (values ('vocabulary'), ('grammar')) phase(name);

  return v_lesson;
end $$;

create or replace function pg_temp.start_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid := gen_random_uuid(); v_version uuid;
begin
  select current_version_id into v_version from public.lessons where id = p_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
  ) values (p_user, p_lesson, v_version, 'custom_topic', 'started', 'compat-behavior-test');
  insert into public.lesson_sessions (
    id, user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint
  ) values (v_session, p_user, p_lesson, v_version, 'active', 'vocabulary', 1, 0, 0, '{}'::jsonb);
  insert into public.lesson_phase_mastery_commits (lesson_session_id, user_id, phase, commit_source)
  values (v_session, p_user, 'story', 'canonical');
  return v_session;
end $$;

-- Answer the first p_count canonical playable activities of a phase.
create or replace function pg_temp.answer_phase(
  p_user uuid, p_session uuid, p_phase text, p_count integer
) returns void language sql as $$
  insert into public.lesson_activity_answers (
    user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
  )
  select p_user, p_session, p_phase, activity.id::text, 'correct', true, 1
  from (
    select activity.id
    from public.lesson_practice_activities activity
    join public.lesson_sessions session on session.id = p_session
    where activity.lesson_version_id = session.lesson_version_id
      and activity.phase = p_phase
    order by activity.position, activity.id
    limit p_count
  ) activity
  on conflict (lesson_session_id, phase, activity_id) do nothing;
$$;

-- Answer the historical rows that sit *beyond* the canonical playable seven.
create or replace function pg_temp.answer_historical_overflow(
  p_user uuid, p_session uuid, p_phase text
) returns void language sql as $$
  insert into public.lesson_activity_answers (
    user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
  )
  select p_user, p_session, p_phase, activity.id::text, 'correct', true, 1
  from (
    select activity.id
    from public.lesson_practice_activities activity
    join public.lesson_sessions session on session.id = p_session
    where activity.lesson_version_id = session.lesson_version_id
      and activity.phase = p_phase
    order by activity.position, activity.id
    offset 7
  ) activity
  on conflict (lesson_session_id, phase, activity_id) do nothing;
$$;

create or replace function pg_temp.commit_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.commit_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

create or replace function pg_temp.evidence_total(p_user uuid)
returns integer language sql as $$
  select coalesce(sum(evidence_count), 0)::integer
  from public.learner_mastery where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- Historical rows exist but never become playable.
-- ---------------------------------------------------------------------------
select set_config('aiko.item', pg_temp.make_item()::text, true);
select set_config('aiko.user', pg_temp.make_learner()::text, true);
select set_config('aiko.lesson',
  pg_temp.make_historical_lesson(current_setting('aiko.user')::uuid,
                                 current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.session',
  pg_temp.start_session(current_setting('aiko.user')::uuid,
                        current_setting('aiko.lesson')::uuid)::text, true);

select is(
  (select count(*)::int from public.lesson_practice_activities activity
   join public.lesson_sessions s on s.id = current_setting('aiko.session')::uuid
   where activity.lesson_version_id = s.lesson_version_id and activity.phase = 'vocabulary'),
  13, 'the fixture carries 13 physical Vocabulary rows');
select is(
  (select count(*)::int from public.lesson_practice_activities activity
   join public.lesson_sessions s on s.id = current_setting('aiko.session')::uuid
   where activity.lesson_version_id = s.lesson_version_id and activity.phase = 'grammar'),
  13, 'the fixture carries 13 physical Grammar rows');

-- ---------------------------------------------------------------------------
-- A partially answered phase commits nothing and earns nothing.
-- ---------------------------------------------------------------------------
select pg_temp.answer_phase(
  current_setting('aiko.user')::uuid, current_setting('aiko.session')::uuid, 'vocabulary', 6);
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.session'), 'vocabulary'),
  '55000', NULL,
  'six of seven Vocabulary answers will not commit the phase');

select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid and phase = 'vocabulary'),
  0, 'an incomplete phase records no commit');
select is(
  pg_temp.evidence_total(current_setting('aiko.user')::uuid),
  0, 'an incomplete phase earns no mastery');

-- ---------------------------------------------------------------------------
-- Answering the historical overflow rows does not complete the phase either:
-- only the canonical playable seven count.
-- ---------------------------------------------------------------------------
select pg_temp.answer_historical_overflow(
  current_setting('aiko.user')::uuid, current_setting('aiko.session')::uuid, 'vocabulary');

select ok(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.session')::uuid
     and phase = 'vocabulary') > 7,
  'the learner has answered more physical rows than the playable contract');

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.session'), 'vocabulary'),
  '55000', NULL,
  'historical overflow answers cannot substitute for the canonical seventh');

-- ---------------------------------------------------------------------------
-- Completing the canonical seven commits exactly once.
-- ---------------------------------------------------------------------------
select pg_temp.answer_phase(
  current_setting('aiko.user')::uuid, current_setting('aiko.session')::uuid, 'vocabulary', 7);

select is(
  (pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                        current_setting('aiko.session')::uuid, 'vocabulary') ->> 'committed'),
  'true', 'the canonical seven Vocabulary answers commit the phase');
select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid and phase = 'vocabulary'),
  1, 'the completed phase records exactly one commit');
select ok(
  pg_temp.evidence_total(current_setting('aiko.user')::uuid) > 0,
  'the completed phase earned canonical mastery');

select set_config('aiko.evidence_after_first',
  pg_temp.evidence_total(current_setting('aiko.user')::uuid)::text, true);

-- ---------------------------------------------------------------------------
-- Duplicate commit is idempotent: reported, recorded and rewarded only once.
-- ---------------------------------------------------------------------------
select is(
  (pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                        current_setting('aiko.session')::uuid, 'vocabulary') ->> 'duplicate'),
  'true', 'a repeated phase commit reports itself as a duplicate');
select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid and phase = 'vocabulary'),
  1, 'a repeated phase commit does not record a second commit');
select is(
  pg_temp.evidence_total(current_setting('aiko.user')::uuid),
  current_setting('aiko.evidence_after_first')::integer,
  'a repeated phase commit awards no additional mastery');

-- ---------------------------------------------------------------------------
-- Phase order is enforced, so a learner cannot jump straight to a later phase.
-- ---------------------------------------------------------------------------
select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.session'), 'reading'),
  '55000', NULL,
  'a later phase cannot commit while an earlier one is open');

-- ---------------------------------------------------------------------------
-- The commit ledger itself is server-owned.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.lesson_phase_mastery_commits', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_phase_mastery_commits', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lesson_phase_mastery_commits', 'DELETE'),
  'the phase commit ledger is read-only to the browser role');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);

select throws_ok(
  format(
    $q$insert into public.lesson_phase_mastery_commits
       (lesson_session_id, user_id, phase, mastery_event_count, commit_source)
       values (%L::uuid, %L::uuid, 'speaking', 99, 'canonical')$q$,
    current_setting('aiko.session'), current_setting('aiko.user')),
  '42501', NULL,
  'learner cannot forge a phase commit');

select throws_ok(
  format(
    $q$update public.lesson_phase_mastery_commits set mastery_event_count = 99
       where lesson_session_id = %L::uuid$q$,
    current_setting('aiko.session')),
  '42501', NULL,
  'learner cannot inflate a recorded phase commit');

reset role;

-- ---------------------------------------------------------------------------
-- EXPLOIT REGRESSION: an answered question cannot be upgraded before commit.
--
-- Before answers were made insert-once, a learner could answer a canonical
-- question wrongly, overwrite the persisted row with the correct answer, and
-- then commit the phase - so canonical mastery and the final score reflected
-- an answer they never actually gave. This proves that path is closed.
--
--   1. answer a canonical Grammar question INCORRECTLY
--   2. attempt to overwrite it with the correct answer
--   3. commit the phase
--   4. canonical mastery must still record 'incorrect'
-- ---------------------------------------------------------------------------
select set_config('aiko.x_user', pg_temp.make_learner()::text, true);
select set_config('aiko.x_lesson',
  pg_temp.make_historical_lesson(current_setting('aiko.x_user')::uuid,
                                 current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.x_session',
  pg_temp.start_session(current_setting('aiko.x_user')::uuid,
                        current_setting('aiko.x_lesson')::uuid)::text, true);

-- Vocabulary must be committed before Grammar is reachable.
select pg_temp.answer_phase(
  current_setting('aiko.x_user')::uuid, current_setting('aiko.x_session')::uuid, 'vocabulary', 7);
select pg_temp.commit_phase(
  current_setting('aiko.x_user')::uuid, current_setting('aiko.x_session')::uuid, 'vocabulary');

-- Step 1: answer all seven canonical Grammar questions with a WRONG answer.
insert into public.lesson_activity_answers (
  user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
)
select current_setting('aiko.x_user')::uuid, current_setting('aiko.x_session')::uuid,
       'grammar', activity.id::text, 'WRONG-ANSWER', false, 1
from (
  select activity.id
  from public.lesson_practice_activities activity
  join public.lesson_sessions session on session.id = current_setting('aiko.x_session')::uuid
  where activity.lesson_version_id = session.lesson_version_id
    and activity.phase = 'grammar'
  order by activity.position, activity.id
  limit 7
) activity;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.x_session')::uuid
     and phase = 'grammar' and selected_answer = 'WRONG-ANSWER'),
  7, 'the learner has answered all seven Grammar questions incorrectly');

-- Step 2: attempt the upgrade, exactly as a compromised client would.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.x_user'), true);

select throws_ok(
  format(
    $q$update public.lesson_activity_answers
       set selected_answer = 'correct', correct = true
       where lesson_session_id = %L::uuid and phase = 'grammar'$q$,
    current_setting('aiko.x_session')),
  '42501', NULL,
  'the learner cannot upgrade their wrong Grammar answers');

-- The conflict-ignore client path must not smuggle the upgrade through either.
select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts)
       select %L::uuid, %L::uuid, 'grammar', answer.activity_id, 'correct', true, 2
       from public.lesson_activity_answers answer
       where answer.lesson_session_id = %L::uuid and answer.phase = 'grammar'
       on conflict (lesson_session_id, phase, activity_id) do nothing$q$,
    current_setting('aiko.x_user'), current_setting('aiko.x_session'),
    current_setting('aiko.x_session')),
  'the conflict-ignore path absorbs the upgrade attempt without error');

reset role;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.x_session')::uuid
     and phase = 'grammar' and selected_answer = 'WRONG-ANSWER'),
  7, 'all seven Grammar answers are still the original incorrect ones');
select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.x_session')::uuid
     and phase = 'grammar'),
  7, 'the upgrade attempt created no extra answer rows');

-- Step 3 and 4: commit the phase, and check what canonical mastery recorded.
select is(
  (pg_temp.commit_phase(current_setting('aiko.x_user')::uuid,
                        current_setting('aiko.x_session')::uuid, 'grammar') ->> 'committed'),
  'true', 'the Grammar phase still commits normally');

select is(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.x_user')::uuid
     and event_data ->> 'phase' = 'grammar'
     and signal = 'correct'),
  0, 'canonical mastery recorded no correct Grammar signal');
select ok(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.x_user')::uuid
     and event_data ->> 'phase' = 'grammar'
     and signal = 'incorrect') > 0,
  'canonical mastery still reflects the original incorrect answers');

-- ---------------------------------------------------------------------------
-- READING ANSWER FINALITY
--
-- Reading responses are now insert-once rows in lesson_activity_answers with
-- phase = 'reading', exactly like Vocabulary and Grammar. Correctness is
-- re-derived in the database from the immutable selected_answer, so a client
-- `correct` flag is never authority.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.reading_lesson(p_user uuid, p_item uuid)
returns uuid language plpgsql as $$
declare v_lesson uuid; v_version uuid;
begin
  v_lesson := pg_temp.make_historical_lesson(p_user, p_item);
  select current_version_id into v_version from public.lessons where id = v_lesson;

  insert into public.lesson_reading_questions (
    lesson_version_id, position, difficulty, question, answer, choices
  )
  select v_version, i, 'easy', 'Reading question ' || i, 'RIGHT-' || i,
         array['RIGHT-' || i, 'WRONG-' || i]
  from generate_series(1, 5) i;

  insert into public.lesson_reading_sections (
    lesson_version_id, position, speaker, japanese_text, translation, target_item_ids
  ) values (v_version, 1, 'ナレーター', '駅に行きます。', 'I go to the station.', array[p_item]);

  return v_lesson;
end $$;

-- Drive a session to the Reading boundary: Story, Vocabulary, Grammar committed.
create or replace function pg_temp.skip_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.skip_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

create or replace function pg_temp.reading_ready_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid;
begin
  v_session := pg_temp.start_session(p_user, p_lesson);
  perform pg_temp.answer_phase(p_user, v_session, 'vocabulary', 7);
  perform pg_temp.commit_phase(p_user, v_session, 'vocabulary');
  perform pg_temp.answer_phase(p_user, v_session, 'grammar', 7);
  perform pg_temp.commit_phase(p_user, v_session, 'grammar');
  return v_session;
end $$;

-- Persist a Reading response the way the browser now does.
create or replace function pg_temp.answer_reading_row(
  p_user uuid, p_session uuid, p_position integer, p_response text
) returns void language plpgsql as $$
declare v_question uuid;
begin
  select question.id into v_question
  from public.lesson_reading_questions question
  join public.lesson_sessions session on session.id = p_session
  where question.lesson_version_id = session.lesson_version_id
    and question.position = p_position;

  insert into public.lesson_activity_answers (
    user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
  ) values (p_user, p_session, 'reading', v_question::text, p_response, true, 1)
  on conflict (lesson_session_id, phase, activity_id) do nothing;
end $$;

select set_config('aiko.r_user', pg_temp.make_learner()::text, true);
select set_config('aiko.r_lesson',
  pg_temp.reading_lesson(current_setting('aiko.r_user')::uuid,
                         current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.r_session',
  pg_temp.reading_ready_session(current_setting('aiko.r_user')::uuid,
                                current_setting('aiko.r_lesson')::uuid)::text, true);

-- Step 1-3: answer Q1 INCORRECTLY, and it persists.
select pg_temp.answer_reading_row(
  current_setting('aiko.r_user')::uuid, current_setting('aiko.r_session')::uuid, 1, 'WRONG-1');

select is(
  (select selected_answer from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.r_session')::uuid and phase = 'reading'),
  'WRONG-1', 'the first Reading response persists as an immutable row');

-- Step 4-6: the replacement is impossible, and the original survives.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.r_user'), true);

select throws_ok(
  format(
    $q$update public.lesson_activity_answers set selected_answer = 'RIGHT-1', correct = true
       where lesson_session_id = %L::uuid and phase = 'reading'$q$,
    current_setting('aiko.r_session')),
  '42501', NULL,
  'learner cannot change a persisted Reading answer');

reset role;

select pg_temp.answer_reading_row(
  current_setting('aiko.r_user')::uuid, current_setting('aiko.r_session')::uuid, 1, 'RIGHT-1');

select is(
  (select selected_answer from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.r_session')::uuid and phase = 'reading'),
  'WRONG-1', 'a replacement Reading response cannot displace the first');
select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.r_session')::uuid and phase = 'reading'),
  1, 'the Reading retry created no second evidence row');

-- Step 7-9: finish Reading correctly, commit, and check what was scored.
select pg_temp.answer_reading_row(
  current_setting('aiko.r_user')::uuid, current_setting('aiko.r_session')::uuid, i, 'RIGHT-' || i)
from generate_series(2, 5) i;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.r_session')::uuid and phase = 'reading'),
  5, 'all five Reading questions carry immutable evidence');

select is(
  (pg_temp.commit_phase(current_setting('aiko.r_user')::uuid,
                        current_setting('aiko.r_session')::uuid, 'reading') ->> 'committed'),
  'true', 'the Reading phase commits from immutable rows');
select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.r_session')::uuid and phase = 'reading'),
  'canonical', 'the Reading commit is canonical, not a legacy bridge');
select is(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.r_user')::uuid
     and event_data ->> 'phase' = 'reading'
     and signal = 'correct'),
  0, 'canonical Reading mastery records no correct signal for a wrong Q1');
select ok(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.r_user')::uuid
     and event_data ->> 'phase' = 'reading'
     and signal = 'incorrect') > 0,
  'canonical Reading mastery still reflects the original wrong Q1');
select is(
  (select (event_data ->> 'correctAnswers')::int from public.learner_mastery_events
   where user_id = current_setting('aiko.r_user')::uuid
     and event_data ->> 'phase' = 'reading' limit 1),
  4, 'the database scored four of five, re-derived from the immutable answers');

-- ---------------------------------------------------------------------------
-- An abandoned incomplete Reading attempt resets safely through the trusted
-- boundary, without the browser ever holding UPDATE or DELETE.
-- ---------------------------------------------------------------------------
select set_config('aiko.rr_user', pg_temp.make_learner()::text, true);
select set_config('aiko.rr_lesson',
  pg_temp.reading_lesson(current_setting('aiko.rr_user')::uuid,
                         current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.rr_session',
  pg_temp.reading_ready_session(current_setting('aiko.rr_user')::uuid,
                                current_setting('aiko.rr_lesson')::uuid)::text, true);

select pg_temp.answer_reading_row(
  current_setting('aiko.rr_user')::uuid, current_setting('aiko.rr_session')::uuid, i, 'RIGHT-' || i)
from generate_series(1, 2) i;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.rr_session')::uuid and phase = 'reading'),
  2, 'the learner answered two of five Reading questions');

select set_config('request.jwt.claim.sub', current_setting('aiko.rr_user'), true);

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.rr_session'), 'reading'),
  '55000', NULL,
  'an incomplete Reading attempt does not commit');
select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.rr_session')::uuid and phase = 'reading'),
  0, 'the abandoned Reading attempt earned no phase commit');

-- Trusted reset discards the incomplete attempt.
select lives_ok(
  format('select public.reset_incomplete_lesson_phase(%L::uuid)',
         current_setting('aiko.rr_session')),
  'the trusted reset accepts the abandoned Reading attempt');
select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.rr_session')::uuid and phase = 'reading'),
  0, 'the abandoned Reading evidence is gone after reset');

-- The learner may now answer afresh from Q1.
select pg_temp.answer_reading_row(
  current_setting('aiko.rr_user')::uuid, current_setting('aiko.rr_session')::uuid, i, 'RIGHT-' || i)
from generate_series(1, 5) i;
select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.rr_session')::uuid and phase = 'reading'),
  5, 'the resumed Reading attempt records fresh answers from Q1');

-- ---------------------------------------------------------------------------
-- The legacy checkpoint fallback is reachable only through the trusted bridge.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE'),
  'the Reading engine with the legacy switch is not callable outside the bridge');
select ok(
  not has_function_privilege('authenticated', 'public.reading_phase_scoreboard(uuid, boolean)', 'EXECUTE'),
  'the Reading scoreboard is not callable by learners');

-- A checkpoint-only session committed through the ordinary RPC must be refused.
select set_config('aiko.cp_user', pg_temp.make_learner()::text, true);
select set_config('aiko.cp_lesson',
  pg_temp.reading_lesson(current_setting('aiko.cp_user')::uuid,
                         current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.cp_session',
  pg_temp.reading_ready_session(current_setting('aiko.cp_user')::uuid,
                                current_setting('aiko.cp_lesson')::uuid)::text, true);

-- Old-style evidence only: responses in the checkpoint, no immutable rows.
update public.lesson_sessions
set checkpoint = jsonb_build_object('session', jsonb_build_object(
      'readingAnswers', (
        select jsonb_agg(jsonb_build_object('questionId', question.id::text, 'response', question.answer))
        from public.lesson_reading_questions question
        join public.lesson_sessions session on session.id = current_setting('aiko.cp_session')::uuid
        where question.lesson_version_id = session.lesson_version_id
      )))
where id = current_setting('aiko.cp_session')::uuid;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.cp_session')::uuid and phase = 'reading'),
  0, 'the old-client fixture has no immutable Reading rows');

select set_config('request.jwt.claim.sub', current_setting('aiko.cp_user'), true);

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.cp_session'), 'reading'),
  '55000', NULL,
  'a direct Reading commit refuses mutable checkpoint evidence');

-- The same session committed through the legacy bridge still works, because
-- an in-flight old Production lesson must survive the migration window.
select lives_ok(
  format('select public.commit_reading_phase(%L::uuid, true)',
         current_setting('aiko.cp_session')),
  'the legacy bridge still commits an old-client Reading phase');
select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.cp_session')::uuid and phase = 'reading'),
  'legacy_checkpoint', 'a bridged Reading commit is recorded as legacy, not canonical');

select * from finish();
rollback;
