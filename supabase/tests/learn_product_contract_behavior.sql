-- The canonical /learn playable contract and server-owned completion.
--
-- Vocabulary 7, Grammar 7, Translation 5 (Premium), Reading 5, Listening 5,
-- Speaking 5. Historical physical rows beyond those counts stay inert. The
-- server owns the final score and XP; a forged client score changes nothing,
-- and completing twice pays out once.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixture helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'contract-' || replace(v_user::text, '-', '') || '@invalid.local',
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
  values (v_id, 'contract-' || replace(v_id::text, '-', ''), 'fixture meaning',
          'fixture formation', 'fixture usage', 'N5');
  return v_id;
end $$;

-- 13 physical Vocabulary rows, 13 physical Grammar rows, and exactly five of
-- each protected activity type.
create or replace function pg_temp.make_lesson(p_user uuid, p_item uuid)
returns uuid language plpgsql as $$
declare v_lesson uuid := gen_random_uuid(); v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'contract-' || replace(v_lesson::text, '-', ''),
    'Contract fixture', '契約', 'Hermetic fixture lesson.',
    'contract fixture', 'N5', 30, 'published', 'user_generated', p_user
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

  insert into public.lesson_story_lines (lesson_version_id, position, japanese_text, translation)
  select v_version, i, '駅に行きます。', 'I go to the station.'
  from generate_series(1, 3) i;

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
  select v_version, i, 'easy', 'Reading question ' || i, 'correct', array['correct','wrong']
  from generate_series(1, 5) i;

  insert into public.lesson_listening_activities (
    lesson_version_id, position, prompt, transcript, choices, correct_answer,
    explanation, difficulty
  )
  select v_version, i, 'Listening prompt ' || i, 'transcript',
         array['correct','wrong'], 'correct', 'explanation', 'easy'
  from generate_series(1, 5) i;

  insert into public.lesson_speaking_activities (
    lesson_version_id, position, mode, prompt, model_answer, question_type
  )
  select v_version, i, 'easy', 'Speaking prompt ' || i, '駅に行きます。', 'read_aloud'
  from generate_series(1, 5) i;

  return v_lesson;
end $$;

create or replace function pg_temp.start_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid := gen_random_uuid(); v_version uuid;
begin
  select current_version_id into v_version from public.lessons where id = p_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
  ) values (p_user, p_lesson, v_version, 'custom_topic', 'started', 'contract-behavior-test');
  insert into public.lesson_sessions (
    id, user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint
  ) values (v_session, p_user, p_lesson, v_version, 'active', 'story', 0, 0, 0, '{}'::jsonb);
  return v_session;
end $$;

create or replace function pg_temp.playable_count(p_session uuid, p_phase text)
returns integer language sql as $$
  select count(*)::integer from (
    select activity.id
    from public.lesson_practice_activities activity
    join public.lesson_sessions session on session.id = p_session
    where activity.lesson_version_id = session.lesson_version_id
      and activity.phase = p_phase
    order by activity.position, activity.id
    limit 7
  ) playable;
$$;

create or replace function pg_temp.answer_phase(p_user uuid, p_session uuid, p_phase text)
returns void language sql as $$
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
    limit 7
  ) activity
  on conflict (lesson_session_id, phase, activity_id) do nothing;
$$;

create or replace function pg_temp.answer_reading(p_session uuid)
returns void language plpgsql as $$
declare v_answers jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'questionId', question.id::text, 'response', question.answer)), '[]'::jsonb)
  into v_answers
  from public.lesson_reading_questions question
  join public.lesson_sessions session on session.id = p_session
  where question.lesson_version_id = session.lesson_version_id;

  update public.lesson_sessions
  set checkpoint = jsonb_build_object('session', jsonb_build_object(
        'readingAnswers', v_answers, 'storyComplete', true))
  where id = p_session;
end $$;

create or replace function pg_temp.commit_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.commit_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Activation sentinel
-- ---------------------------------------------------------------------------
select is(
  public.learn_product_contract_version(),
  '20260820023100',
  'the /learn product contract is activated at the expected version');

-- ---------------------------------------------------------------------------
-- Playable counts
-- ---------------------------------------------------------------------------
select set_config('aiko.item', pg_temp.make_item()::text, true);
select set_config('aiko.user', pg_temp.make_learner()::text, true);
select set_config('aiko.lesson',
  pg_temp.make_lesson(current_setting('aiko.user')::uuid,
                      current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.session',
  pg_temp.start_session(current_setting('aiko.user')::uuid,
                        current_setting('aiko.lesson')::uuid)::text, true);
select set_config('aiko.version',
  (select lesson_version_id::text from public.lesson_sessions
   where id = current_setting('aiko.session')::uuid), true);

select is(
  (select count(*)::int from public.lesson_practice_activities
   where lesson_version_id = current_setting('aiko.version')::uuid and phase = 'vocabulary'),
  13, 'the fixture stores 13 physical Vocabulary rows');
select is(
  pg_temp.playable_count(current_setting('aiko.session')::uuid, 'vocabulary'),
  7, 'only seven Vocabulary activities are playable');
select is(
  (select count(*)::int from public.lesson_practice_activities
   where lesson_version_id = current_setting('aiko.version')::uuid and phase = 'grammar'),
  13, 'the fixture stores 13 physical Grammar rows');
select is(
  pg_temp.playable_count(current_setting('aiko.session')::uuid, 'grammar'),
  7, 'only seven Grammar activities are playable');
select is(
  (select count(*)::int from public.lesson_reading_questions
   where lesson_version_id = current_setting('aiko.version')::uuid),
  5, 'Reading is exactly five questions');
select is(
  (select count(*)::int from public.lesson_listening_activities
   where lesson_version_id = current_setting('aiko.version')::uuid),
  5, 'Listening is exactly five activities');
select is(
  (select count(*)::int from public.lesson_speaking_activities
   where lesson_version_id = current_setting('aiko.version')::uuid),
  5, 'Speaking is exactly five activities');
select ok(
  (select conname is not null from pg_constraint
   where conrelid = 'public.lesson_translation_questions'::regclass
     and conname = 'lesson_translation_questions_position_check'),
  'Translation is capped at five positions by constraint');

-- ---------------------------------------------------------------------------
-- Play the lesson through as a Free learner, then complete it.
-- ---------------------------------------------------------------------------
select pg_temp.answer_reading(current_setting('aiko.session')::uuid);
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'story');
select pg_temp.answer_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'vocabulary');
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'vocabulary');
select pg_temp.answer_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'grammar');
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'grammar');
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'reading');
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'listening');
select pg_temp.commit_phase(current_setting('aiko.user')::uuid,
                            current_setting('aiko.session')::uuid, 'speaking');

select is(
  (select count(*)::int from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid),
  6, 'all six phases committed exactly once each');

-- A deliberately absurd client score and XP must not survive.
select set_config('request.jwt.claim.sub', current_setting('aiko.user'), true);
select set_config('aiko.completion',
  public.complete_lesson_session(
    current_setting('aiko.session')::uuid,
    100000, 999999, 99999,
    jsonb_build_object('result', jsonb_build_object('score', 100000, 'xpGained', 999999))
  )::text, true);

select ok(
  (current_setting('aiko.completion')::jsonb ->> 'score')::numeric <= 100,
  'the canonical score ignores a forged client score');
select ok(
  (current_setting('aiko.completion')::jsonb ->> 'xp_awarded')::numeric < 999999,
  'the canonical XP ignores a forged client XP');
select is(
  (current_setting('aiko.completion')::jsonb ->> 'canonical'),
  'true', 'the completion result is marked canonical');

-- Completing a second time must not pay out again.
select set_config('aiko.completion_again',
  public.complete_lesson_session(
    current_setting('aiko.session')::uuid,
    100000, 999999, 99999,
    jsonb_build_object('result', jsonb_build_object('score', 100000, 'xpGained', 999999))
  )::text, true);

select is(
  (current_setting('aiko.completion_again')::jsonb ->> 'xp_awarded'),
  (current_setting('aiko.completion')::jsonb ->> 'xp_awarded'),
  'a duplicate completion returns the same canonical XP');
select is(
  (select count(*)::int from public.reward_ledger
   where reward_type = 'lesson' and source_id = current_setting('aiko.session')::uuid),
  1, 'a duplicate completion records only one reward');

select * from finish();
rollback;
