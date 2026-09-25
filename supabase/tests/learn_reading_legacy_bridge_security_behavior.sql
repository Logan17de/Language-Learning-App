-- Security regression for the Reading legacy checkpoint compatibility bridge.
--
-- The mutable lesson_sessions.checkpoint remains learner-writable for resume/UI
-- state, but it must never be able to manufacture legacy Reading eligibility.
-- Only the server-owned rollout snapshot may authorize checkpoint Reading
-- evidence, and this suite exercises the real authenticated UPDATE -> trigger
-- path for both the rejected post-migration session and an explicitly trusted
-- legacy fixture.

begin;
create extension if not exists pgtap;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixture helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'legacy-bridge-' || replace(v_user::text, '-', '') || '@invalid.local',
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
  values (v_id, 'legacy-bridge-' || replace(v_id::text, '-', ''), 'fixture meaning',
          'fixture formation', 'fixture usage', 'N5');
  return v_id;
end $$;

create or replace function pg_temp.make_reading_lesson(p_user uuid, p_item uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'legacy-bridge-' || replace(v_lesson::text, '-', ''),
    'Legacy bridge fixture', '互換', 'Hermetic Reading bridge fixture.',
    'legacy bridge fixture', 'N5', 30, 'published', 'user_generated', p_user
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

create or replace function pg_temp.start_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid := gen_random_uuid(); v_version uuid;
begin
  select current_version_id into v_version from public.lessons where id = p_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
  ) values (p_user, p_lesson, v_version, 'custom_topic', 'started', 'legacy-bridge-security-test');
  insert into public.lesson_sessions (
    id, user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint
  ) values (v_session, p_user, p_lesson, v_version, 'active', 'story', 0, 0, 0, '{}'::jsonb);
  return v_session;
end $$;

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

create or replace function pg_temp.commit_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.commit_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

-- Story, Vocabulary and Grammar all cross the normal phase RPC using canonical
-- phase evidence. The session is then ready for Reading with no Reading rows.
create or replace function pg_temp.reading_ready_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid;
begin
  v_session := pg_temp.start_session(p_user, p_lesson);

  update public.lesson_sessions
  set checkpoint = jsonb_build_object('session', jsonb_build_object('storyComplete', true))
  where id = v_session;
  perform pg_temp.commit_phase(p_user, v_session, 'story');

  perform pg_temp.answer_phase(p_user, v_session, 'vocabulary', 7);
  perform pg_temp.commit_phase(p_user, v_session, 'vocabulary');

  perform pg_temp.answer_phase(p_user, v_session, 'grammar', 7);
  perform pg_temp.commit_phase(p_user, v_session, 'grammar');

  return v_session;
end $$;

create or replace function pg_temp.forged_legacy_checkpoint(p_session uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'session', jsonb_build_object(
      'completedPhaseIds', jsonb_build_array('story','vocabulary','grammar','reading'),
      'readingAnswers', coalesce((
        select jsonb_agg(
          jsonb_build_object('questionId', question.id::text, 'response', question.answer)
          order by question.position
        )
        from public.lesson_reading_questions question
        join public.lesson_sessions session on session.id = p_session
        where question.lesson_version_id = session.lesson_version_id
      ), '[]'::jsonb)
    )
  );
$$;

select set_config('aiko.bridge_item', pg_temp.make_item()::text, true);

-- ---------------------------------------------------------------------------
-- Server-owned registry privileges: learners cannot read or mutate membership.
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('authenticated', 'public.lesson_legacy_checkpoint_sessions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.lesson_legacy_checkpoint_sessions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.lesson_legacy_checkpoint_sessions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.lesson_legacy_checkpoint_sessions', 'DELETE')
  and not has_table_privilege('authenticated', 'public.lesson_legacy_checkpoint_sessions', 'TRUNCATE'),
  'authenticated has no privileges on the server-owned legacy eligibility registry');

-- ---------------------------------------------------------------------------
-- REAL EXPLOIT REGRESSION: a post-migration session cannot manufacture legacy
-- eligibility through a learner-authored checkpoint UPDATE.
-- ---------------------------------------------------------------------------
select set_config('aiko.attack_user', pg_temp.make_learner()::text, true);
select set_config('aiko.attack_lesson',
  pg_temp.make_reading_lesson(current_setting('aiko.attack_user')::uuid,
                              current_setting('aiko.bridge_item')::uuid)::text, true);
select set_config('aiko.attack_session',
  pg_temp.reading_ready_session(current_setting('aiko.attack_user')::uuid,
                                current_setting('aiko.attack_lesson')::uuid)::text, true);
select set_config('aiko.attack_checkpoint',
  pg_temp.forged_legacy_checkpoint(current_setting('aiko.attack_session')::uuid)::text, true);

select is(
  (select count(*)::int from public.lesson_legacy_checkpoint_sessions
   where lesson_session_id = current_setting('aiko.attack_session')::uuid),
  0, 'a session created after migration is not legacy-eligible');
select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.attack_session')::uuid and phase = 'reading'),
  0, 'the attack session has no immutable Reading evidence');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.attack_user'), true);

select lives_ok(
  format(
    $q$update public.lesson_sessions set checkpoint = %L::jsonb where id = %L::uuid$q$,
    current_setting('aiko.attack_checkpoint'), current_setting('aiko.attack_session')),
  'authenticated forged checkpoint UPDATE executes the real AFTER UPDATE trigger');

reset role;

select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.attack_session')::uuid and phase = 'reading'),
  0, 'the forged checkpoint trigger path records no Reading phase commit');
select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.attack_session')::uuid
     and phase = 'reading' and commit_source = 'legacy_checkpoint'),
  0, 'the forged checkpoint cannot create a legacy_checkpoint Reading commit');
select is(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.attack_user')::uuid
     and event_data ->> 'phase' = 'reading'),
  0, 'the forged checkpoint trigger path earns no Reading mastery');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.attack_user'), true);
select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.attack_session'), 'reading'),
  '55000', NULL,
  'ordinary Reading commit still refuses checkpoint-only evidence');

select throws_ok(
  format(
    'insert into public.lesson_legacy_checkpoint_sessions (lesson_session_id) values (%L::uuid)',
    current_setting('aiko.attack_session')),
  '42501', NULL,
  'authenticated learner cannot insert legacy eligibility');
select throws_ok(
  'update public.lesson_legacy_checkpoint_sessions set marked_at = now()',
  '42501', NULL,
  'authenticated learner cannot update legacy eligibility');
select throws_ok(
  'delete from public.lesson_legacy_checkpoint_sessions',
  '42501', NULL,
  'authenticated learner cannot delete legacy eligibility');
reset role;

select is(
  (select count(*)::int from public.lesson_legacy_checkpoint_sessions
   where lesson_session_id = current_setting('aiko.attack_session')::uuid),
  0, 'learner actions cannot make the new session legacy-eligible');

-- ---------------------------------------------------------------------------
-- REAL OLD-CLIENT COMPATIBILITY: trusted setup marks the session in the same
-- server-owned registry populated by the rollout snapshot, then the old client
-- performs its normal authenticated checkpoint UPDATE and the trigger commits.
-- ---------------------------------------------------------------------------
select set_config('aiko.legacy_user', pg_temp.make_learner()::text, true);
select set_config('aiko.legacy_lesson',
  pg_temp.make_reading_lesson(current_setting('aiko.legacy_user')::uuid,
                              current_setting('aiko.bridge_item')::uuid)::text, true);
select set_config('aiko.legacy_session',
  pg_temp.reading_ready_session(current_setting('aiko.legacy_user')::uuid,
                                current_setting('aiko.legacy_lesson')::uuid)::text, true);

insert into public.lesson_legacy_checkpoint_sessions (lesson_session_id)
values (current_setting('aiko.legacy_session')::uuid);

select is(
  (select count(*)::int from public.lesson_legacy_checkpoint_sessions
   where lesson_session_id = current_setting('aiko.legacy_session')::uuid),
  1, 'trusted setup can mark an in-flight legacy session');

select set_config('aiko.legacy_checkpoint',
  pg_temp.forged_legacy_checkpoint(current_setting('aiko.legacy_session')::uuid)::text, true);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.legacy_user'), true);
select lives_ok(
  format(
    $q$update public.lesson_sessions set checkpoint = %L::jsonb where id = %L::uuid$q$,
    current_setting('aiko.legacy_checkpoint'), current_setting('aiko.legacy_session')),
  'authenticated old-client checkpoint UPDATE commits through the real legacy trigger');
reset role;

select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.legacy_session')::uuid and phase = 'reading'),
  'legacy_checkpoint', 'server-marked legacy Reading commits with legacy_checkpoint source');
select ok(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.legacy_user')::uuid
     and event_data ->> 'phase' = 'reading'
     and signal = 'correct') > 0,
  'the legitimate legacy trigger path can still award its Reading mastery');

select * from finish();
rollback;
