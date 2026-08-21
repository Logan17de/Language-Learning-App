-- Server-owned completion evidence must not be forgeable by learners.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.
-- Nothing here depends on seed data or on whatever rows happen to exist.

begin;
create extension if not exists pgtap;

select plan(12);

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
select is(
  (select count(*)::int from public.learner_mastery
   where user_id = current_setting('aiko.user')::uuid),
  0,
  'the retired RPC wrote no mastery aggregate'
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

select * from finish();
rollback;
