-- Server-owned completion evidence must not be forgeable by learners.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.
-- Nothing here depends on seed data or on whatever rows happen to exist.

begin;
create extension if not exists pgtap;

select plan(28);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
select set_config('aiko.user', gen_random_uuid()::text, true);
select set_config('aiko.lesson', gen_random_uuid()::text, true);
select set_config('aiko.version', gen_random_uuid()::text, true);
select set_config('aiko.session', gen_random_uuid()::text, true);

insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (
  current_setting('aiko.user')::uuid, 'authenticated', 'authenticated',
  'evidence-' || replace(current_setting('aiko.user'), '-', '') || '@invalid.local',
  '{}'::jsonb, now(), now()
);

insert into public.lessons (
  id, slug, title, japanese_title, summary, topic, jlpt_level,
  duration_minutes, status, source, generated_for_user_id
) values (
  current_setting('aiko.lesson')::uuid,
  'evidence-fixture-' || replace(current_setting('aiko.lesson'), '-', ''),
  'Evidence fixture', '証拠フィクスチャ', 'Hermetic fixture lesson.',
  'evidence fixture', 'N5', 30, 'published', 'user_generated',
  current_setting('aiko.user')::uuid
);

insert into public.lesson_versions (id, lesson_id, version_number, status)
values (
  current_setting('aiko.version')::uuid,
  current_setting('aiko.lesson')::uuid, 1, 'published'
);

update public.lessons
set current_version_id = current_setting('aiko.version')::uuid
where id = current_setting('aiko.lesson')::uuid;

insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
) values (
  current_setting('aiko.user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'custom_topic', 'started', 'evidence-behavior-test'
);

insert into public.lesson_sessions (
  id, user_id, lesson_id, lesson_version_id, status,
  current_phase, current_phase_index, activity_index, elapsed_seconds, checkpoint
) values (
  current_setting('aiko.session')::uuid,
  current_setting('aiko.user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'active', 'grammar', 2, 0, 0, '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- ACL contract. These are privilege facts, independent of any row.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'SELECT'),
  'Translation model answers are unreadable by the browser role'
);
select ok(
  not has_table_privilege('authenticated', 'public.learner_mastery', 'INSERT')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'DELETE')
  and not has_table_privilege('authenticated', 'public.learner_mastery', 'TRUNCATE'),
  'learner_mastery is read-only for the browser role'
);
select ok(
  not has_table_privilege('authenticated', 'public.learner_mastery_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'DELETE')
  and not has_table_privilege('authenticated', 'public.learner_mastery_events', 'TRUNCATE'),
  'learner_mastery_events ledger is append-only to the server, read-only to the learner'
);
select ok(
  has_table_privilege('authenticated', 'public.lesson_activity_answers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_activity_answers', 'DELETE'),
  'learner may record answers but never delete them'
);

-- ---------------------------------------------------------------------------
-- record_mastery_evidence() is retired as a reward authority.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select public.record_mastery_evidence(
      current_setting('aiko.session')::uuid,
      jsonb_build_array(jsonb_build_object(
        'clientEventId', 'forged:1', 'itemType', 'kanji', 'itemKey', 'forged-kanji',
        'dimension', 'recognition', 'signal', 'correct'
      ))
    ) ->> 'retired'
  ),
  'true',
  'record_mastery_evidence() reports itself retired'
);

select is(
  (
    select public.record_mastery_evidence(
      current_setting('aiko.session')::uuid,
      jsonb_build_array(jsonb_build_object(
        'clientEventId', 'forged:2', 'itemType', 'kanji', 'itemKey', 'forged-kanji',
        'dimension', 'recognition', 'signal', 'correct'
      ))
    ) ->> 'processed'
  ),
  '0',
  'record_mastery_evidence() processes nothing'
);

reset role;

select is(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.user')::uuid),
  0,
  'the retired RPC wrote no mastery events'
);
-- profiles_sync_mastery_ceiling seeds level-scoped baseline rows at zero for
-- every learner, so the contract is that no mastery was *earned*.
select is(
  (select count(*)::int from public.learner_mastery
   where user_id = current_setting('aiko.user')::uuid
     and (mastery > 0 or evidence_count > 0)),
  0,
  'the retired RPC earned no mastery'
);

-- ---------------------------------------------------------------------------
-- Protected phase evidence cannot be learner-written. The RLS WITH CHECK on
-- lesson_activity_answers restricts phase to the four learner-answerable
-- phases, so Translation and Speaking verdicts can only come from a trusted
-- server route.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);

select throws_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data)
       values (%L::uuid, %L::uuid, 'grammar_translation', 'forged-translation', 'forged', true, 1,
               '{"serverValidated":true}'::jsonb)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')
  ),
  '42501',
  NULL,
  'learner cannot forge serverValidated Translation evidence'
);

select throws_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data)
       values (%L::uuid, %L::uuid, 'speaking', 'forged-speaking', 'forged', true, 1,
               '{"serverValidated":true,"score":100}'::jsonb)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')
  ),
  '42501',
  NULL,
  'learner cannot forge serverValidated Speaking evidence'
);

select throws_ok(
  format(
    $q$insert into public.learner_mastery (user_id, item_type, item_key, mastery)
       values (%L::uuid, 'kanji', 'forged-kanji', 100)$q$,
    current_setting('aiko.user')
  ),
  '42501',
  NULL,
  'learner cannot write the mastery aggregate directly'
);

select throws_ok(
  format(
    $q$insert into public.learner_mastery_events
       (user_id, client_event_id, item_type, item_key, dimension, signal, score_delta)
       values (%L::uuid, 'forged:3', 'kanji', 'forged-kanji', 'recognition', 'correct', 100)$q$,
    current_setting('aiko.user')
  ),
  '42501',
  NULL,
  'learner cannot append to the mastery ledger directly'
);

-- A legitimate answer in an answerable phase must still succeed, so the
-- assertions above prove a boundary rather than a blanket denial.
select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts)
       values (%L::uuid, %L::uuid, 'vocabulary', 'legit-vocab-1', 'えき', true, 1)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')
  ),
  'learner can record their own Vocabulary answer'
);

reset role;

-- ---------------------------------------------------------------------------
-- ANSWER FINALITY
--
-- Once a question is answered, that answer is final. The learner keeps INSERT
-- so they can record answers, but has no UPDATE at all, and the browser
-- persistence path resolves conflicts with DO NOTHING. An identical retry is
-- therefore a harmless no-op, while a different second answer cannot replace
-- the first.
--
-- Scope note: Vocabulary and Grammar answers live in lesson_activity_answers
-- and Listening evidence lives in lesson_events, so both ledgers are proved
-- immutable here. Reading answers are held in the session checkpoint rather
-- than a ledger row, so Reading finality is carried by the one-shot phase
-- commit instead, proved in learn_phase_mastery_compatibility_behavior.sql.
-- ---------------------------------------------------------------------------
select ok(
  has_table_privilege('authenticated', 'public.lesson_activity_answers', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_activity_answers', 'UPDATE'),
  'answers are insert-once for the browser role'
);
select ok(
  has_table_privilege('authenticated', 'public.lesson_events', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_events', 'UPDATE'),
  'lesson events are insert-once for the browser role'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);

select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts)
       values (%L::uuid, %L::uuid, 'grammar', 'final-grammar-1', 'ANSWER-A', true, 1)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'learner records their first Grammar answer'
);
select lives_ok(
  format(
    $q$insert into public.lesson_events
       (user_id, lesson_session_id, client_event_id, phase, event_type, event_data)
       values (%L::uuid, %L::uuid, 'listening:1', 'listening', 'answered',
               '{"selected":"ANSWER-A"}'::jsonb)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'learner records their first Listening event'
);

-- Direct mutation is refused outright.
select throws_ok(
  format(
    $q$update public.lesson_activity_answers set selected_answer = 'ANSWER-B'
       where lesson_session_id = %L::uuid and activity_id = 'legit-vocab-1'$q$,
    current_setting('aiko.session')),
  '42501', NULL,
  'learner cannot change a persisted Vocabulary answer'
);
select throws_ok(
  format(
    $q$update public.lesson_activity_answers set selected_answer = 'ANSWER-B', correct = true
       where lesson_session_id = %L::uuid and activity_id = 'final-grammar-1'$q$,
    current_setting('aiko.session')),
  '42501', NULL,
  'learner cannot change a persisted Grammar answer'
);
select throws_ok(
  format(
    $q$update public.lesson_events set event_data = '{"selected":"ANSWER-B"}'::jsonb
       where lesson_session_id = %L::uuid and client_event_id = 'listening:1'$q$,
    current_setting('aiko.session')),
  '42501', NULL,
  'learner cannot change a persisted Listening event'
);

-- The browser replays the whole phase on each sync, so an identical retry
-- must be safe rather than an error.
select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts)
       values (%L::uuid, %L::uuid, 'grammar', 'final-grammar-1', 'ANSWER-A', true, 1)
       on conflict (lesson_session_id, phase, activity_id) do nothing$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'an identical answer retry is a harmless no-op'
);

-- A different second answer, sent through the same conflict-ignore path the
-- browser now uses, cannot displace the first.
select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts)
       values (%L::uuid, %L::uuid, 'grammar', 'final-grammar-1', 'ANSWER-B', false, 2)
       on conflict (lesson_session_id, phase, activity_id) do nothing$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'a replacement answer is absorbed without error by the client path'
);

reset role;

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.session')::uuid
     and activity_id = 'final-grammar-1'),
  1, 'the retry created no second answer row'
);
select is(
  (select selected_answer from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.session')::uuid
     and activity_id = 'final-grammar-1'),
  'ANSWER-A', 'the originally submitted answer remains authoritative'
);
select is(
  (select count(*)::int from public.lesson_events
   where lesson_session_id = current_setting('aiko.session')::uuid
     and client_event_id = 'listening:1'),
  1, 'the Listening event ledger holds exactly one row'
);

-- ---------------------------------------------------------------------------
-- Trusted server validation must keep working. Translation and Speaking
-- verdicts are written by the service role, which these grants do not touch.
-- ---------------------------------------------------------------------------
set local role service_role;

select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data)
       values (%L::uuid, %L::uuid, 'grammar_translation', 'server-translation-1',
               'X', true, 1,
               '{"serverValidated":true,"validationSource":"exact_match"}'::jsonb)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'the service role can still record trusted Translation evidence'
);
select lives_ok(
  format(
    $q$insert into public.lesson_activity_answers
       (user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data)
       values (%L::uuid, %L::uuid, 'speaking', 'server-speaking-1',
               'X', true, 1,
               '{"serverValidated":true,"score":88}'::jsonb)$q$,
    current_setting('aiko.user'), current_setting('aiko.session')),
  'the service role can still record trusted Speaking evidence'
);
select lives_ok(
  format(
    $q$update public.lesson_activity_answers
       set answer_data = '{"serverValidated":true,"validationSource":"ai"}'::jsonb
       where lesson_session_id = %L::uuid and activity_id = 'server-translation-1'$q$,
    current_setting('aiko.session')),
  'the service role can still revise its own Translation verdict'
);

reset role;

select * from finish();
rollback;
