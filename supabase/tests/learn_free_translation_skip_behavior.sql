-- Translation is Premium-only, and a Free learner Skips it without penalty.
--
-- Free   Grammar commits on the seven standard Grammar answers alone.
-- Paid   Grammar additionally requires exactly five serverValidated Translations.
-- A Free Skip awards zero protected mastery and never blocks the lesson.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(21);

-- ---------------------------------------------------------------------------
-- Fixture helpers
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner(p_plan text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'skip-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set subscription_plan = p_plan::public.subscription_plan, status = 'active', timezone = 'UTC'
  where id = v_user;
  return v_user;
end $$;

-- A grammar item the canonical engine can attribute mastery to.
create or replace function pg_temp.make_grammar_item()
returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.grammar_records (id, pattern, meaning, formation, usage_notes, jlpt_level)
  values (v_id, 'skip-pattern-' || replace(v_id::text, '-', ''), 'fixture meaning',
          'fixture formation', 'fixture usage', 'N5');
  return v_id;
end $$;

-- Builds a lesson whose Grammar phase has MORE physical rows than the
-- canonical playable seven, so the trimming contract is exercised too.
create or replace function pg_temp.make_lesson(p_user uuid, p_grammar_rows integer, p_item uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'skip-' || replace(v_lesson::text, '-', ''),
    'Skip fixture', 'スキップ', 'Hermetic fixture lesson.',
    'skip fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;

  -- Canonical mastery only accepts items that belong to the lesson.
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
  select v_version, i, 'grammar', 'multiple_choice', 'Easy', 'multiple-choice',
         'understanding', 'Grammar prompt ' || i, 'correct',
         array['correct'], array[p_item]
  from generate_series(1, p_grammar_rows) i;

  -- Reading is exactly five questions in the playable contract.
  insert into public.lesson_reading_questions (
    lesson_version_id, position, difficulty, question, answer, choices
  )
  select v_version, i, 'easy', 'Reading question ' || i, 'correct',
         array['correct', 'wrong']
  from generate_series(1, 5) i;

  return v_lesson;
end $$;

create or replace function pg_temp.start_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare
  v_session uuid := gen_random_uuid();
  v_version uuid;
begin
  select current_version_id into v_version from public.lessons where id = p_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
  ) values (p_user, p_lesson, v_version, 'custom_topic', 'started', 'skip-behavior-test');
  insert into public.lesson_sessions (
    id, user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint
  ) values (v_session, p_user, p_lesson, v_version, 'active', 'grammar', 2, 0, 0, '{}'::jsonb);
  -- Story and Vocabulary must be committed before Grammar is reachable.
  insert into public.lesson_phase_mastery_commits (lesson_session_id, user_id, phase, commit_source)
  values (v_session, p_user, 'story', 'canonical'),
         (v_session, p_user, 'vocabulary', 'canonical');
  return v_session;
end $$;

-- Answer exactly the seven canonical playable Grammar activities.
create or replace function pg_temp.answer_grammar(p_user uuid, p_session uuid)
returns void language sql as $$
  insert into public.lesson_activity_answers (
    user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
  )
  select p_user, p_session, 'grammar', activity.id::text, 'correct', true, 1
  from (
    select activity.id
    from public.lesson_practice_activities activity
    join public.lesson_sessions session on session.id = p_session
    where activity.lesson_version_id = session.lesson_version_id
      and activity.phase = 'grammar'
    order by activity.position, activity.id
    limit 7
  ) activity;
$$;

create or replace function pg_temp.add_translations(
  p_user uuid, p_session uuid, p_item uuid, p_validated integer
) returns void language plpgsql as $$
declare
  v_lesson uuid; v_version uuid; v_id uuid; i integer;
begin
  select lesson_id, lesson_version_id into v_lesson, v_version
  from public.lesson_sessions where id = p_session;
  for i in 1..5 loop
    v_id := gen_random_uuid();
    insert into public.lesson_translation_questions (
      id, user_id, lesson_session_id, lesson_id, lesson_version_id, position,
      english_prompt, target_item_id, target_pattern, target_meaning, target_role, model_answer
    ) values (
      v_id, p_user, p_session, v_lesson, v_version, i,
      'English prompt ' || i, p_item, 'fixture pattern', 'fixture meaning',
      'lesson', '駅に行きます。'
    );
    if i <= p_validated then
      insert into public.lesson_activity_answers (
        user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data
      ) values (
        p_user, p_session, 'grammar_translation', v_id::text, '駅に行きます。', true, 1,
        jsonb_build_object('serverValidated', true, 'validationSource', 'exact_match')
      );
    end if;
  end loop;
end $$;

-- Reading answers are immutable evidence rows, persisted the way the browser
-- does, so the Reading commit reads them from lesson_activity_answers.
create or replace function pg_temp.answer_reading(p_session uuid)
returns void language plpgsql as $$
begin
  -- Reading responses are immutable learner evidence rows now, not checkpoint
  -- state, so the fixture persists them the way the browser does.
  insert into public.lesson_activity_answers (
    user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts
  )
  select session.user_id, p_session, 'reading', question.id::text, question.answer, true, 1
  from public.lesson_reading_questions question
  join public.lesson_sessions session on session.id = p_session
  where question.lesson_version_id = session.lesson_version_id
  on conflict (lesson_session_id, phase, activity_id) do nothing;
end $$;

create or replace function pg_temp.commit_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.commit_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

create or replace function pg_temp.skip_phase(p_user uuid, p_session uuid, p_phase text)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.skip_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

create or replace function pg_temp.earned_mastery(p_user uuid)
returns integer language sql as $$
  select count(*)::integer from public.learner_mastery
  where user_id = p_user and (mastery > 0 or evidence_count > 0);
$$;

-- ---------------------------------------------------------------------------
-- Free learner: Translation is unreachable, and Grammar commits without it.
-- ---------------------------------------------------------------------------
select set_config('aiko.item', pg_temp.make_grammar_item()::text, true);
select set_config('aiko.free', pg_temp.make_learner('free')::text, true);
select set_config('aiko.free_lesson',
  pg_temp.make_lesson(current_setting('aiko.free')::uuid, 13,
                      current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.free_session',
  pg_temp.start_session(current_setting('aiko.free')::uuid,
                        current_setting('aiko.free_lesson')::uuid)::text, true);

select ok(
  not has_table_privilege('authenticated', 'public.lesson_translation_questions', 'SELECT'),
  'Free learner has no table privilege on Translation questions at all'
);

select is(
  (select count(*)::int from public.lesson_practice_activities activity
   join public.lesson_sessions s on s.id = current_setting('aiko.free_session')::uuid
   where activity.lesson_version_id = s.lesson_version_id and activity.phase = 'grammar'),
  13,
  'the fixture really does carry 13 physical Grammar rows'
);

select pg_temp.answer_grammar(
  current_setting('aiko.free')::uuid, current_setting('aiko.free_session')::uuid);

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.free_session')::uuid
     and phase = 'grammar'),
  7,
  'only the seven canonical playable Grammar activities are answered'
);

select is(
  (pg_temp.commit_phase(current_setting('aiko.free')::uuid,
                        current_setting('aiko.free_session')::uuid, 'grammar') ->> 'committed'),
  'true',
  'Free Grammar commits on seven answers with no Translation'
);

select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.free_session')::uuid and phase = 'grammar'),
  'canonical',
  'the Free Grammar commit is canonical, not a legacy bridge'
);

select is(
  (select count(*)::int from public.learner_mastery_events
   where user_id = current_setting('aiko.free')::uuid
     and event_data -> 'data' ->> 'translationQuestionId' is not null),
  0,
  'a Free Skip awards no Translation mastery'
);

-- Translation is a section of its own, so a Free learner passes it with an
-- explicit skip rather than by Grammar implicitly covering both.
select is(
  (pg_temp.skip_phase(current_setting('aiko.free')::uuid,
                      current_setting('aiko.free_session')::uuid, 'translation') ->> 'skipped'),
  'true',
  'a Free learner skips Translation as its own section'
);
select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.free_session')::uuid
     and phase = 'translation'),
  'skipped',
  'the Free Translation row is recorded as a skip, not a canonical commit'
);

-- Reading is reachable straight after the Translation skip for a Free learner.
select is(
  (select count(*)::int from public.lesson_reading_questions question
   join public.lesson_sessions s on s.id = current_setting('aiko.free_session')::uuid
   where question.lesson_version_id = s.lesson_version_id),
  5,
  'Reading is exactly five questions'
);

select pg_temp.answer_reading(current_setting('aiko.free_session')::uuid);

select is(
  (pg_temp.commit_phase(current_setting('aiko.free')::uuid,
                        current_setting('aiko.free_session')::uuid, 'reading') ->> 'committed'),
  'true',
  'Free learner reaches Reading directly after the Translation Skip'
);

-- Protected Listening and Speaking may also be skipped without blocking.
select is(
  (pg_temp.commit_phase(current_setting('aiko.free')::uuid,
                        current_setting('aiko.free_session')::uuid, 'listening') ->> 'committed'),
  'true',
  'Free learner may Skip Listening without blocking the lesson'
);
select is(
  (pg_temp.commit_phase(current_setting('aiko.free')::uuid,
                        current_setting('aiko.free_session')::uuid, 'speaking') ->> 'committed'),
  'true',
  'Free learner may Skip Speaking without blocking the lesson'
);
select is(
  (select coalesce(sum(mastery_event_count), 0)::int
   from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.free_session')::uuid
     and phase in ('listening','speaking')),
  0,
  'skipped protected phases award zero mastery'
);

-- ---------------------------------------------------------------------------
-- Premium learner: Grammar requires exactly five serverValidated Translations.
-- ---------------------------------------------------------------------------
select set_config('aiko.paid', pg_temp.make_learner('premium_monthly')::text, true);
select set_config('aiko.paid_lesson',
  pg_temp.make_lesson(current_setting('aiko.paid')::uuid, 13,
                      current_setting('aiko.item')::uuid)::text, true);
select set_config('aiko.paid_session',
  pg_temp.start_session(current_setting('aiko.paid')::uuid,
                        current_setting('aiko.paid_lesson')::uuid)::text, true);
select pg_temp.answer_grammar(
  current_setting('aiko.paid')::uuid, current_setting('aiko.paid_session')::uuid);

-- Grammar answers for its own seven and nothing else now: the Translation
-- requirement moved to the Translation section, so Grammar no longer waits on
-- it. Commit Grammar first, then hold Translation to that requirement.
select is(
  (pg_temp.commit_phase(current_setting('aiko.paid')::uuid,
                        current_setting('aiko.paid_session')::uuid, 'grammar') ->> 'committed'),
  'true',
  'Premium Grammar commits on its seven answers alone'
);

-- throws_ok runs raw SQL, so the Premium learner's identity must be current.
select set_config('request.jwt.claim.sub', current_setting('aiko.paid'), true);

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.paid_session'), 'translation'),
  '55000',
  NULL,
  'Premium Translation will not commit with no validated answers'
);

-- Four of five validated is still not enough.
select pg_temp.add_translations(
  current_setting('aiko.paid')::uuid, current_setting('aiko.paid_session')::uuid,
  current_setting('aiko.item')::uuid, 4);

select set_config('request.jwt.claim.sub', current_setting('aiko.paid'), true);

select throws_ok(
  format('select public.commit_lesson_phase(%L::uuid, %L)',
         current_setting('aiko.paid_session'), 'translation'),
  '55000',
  NULL,
  'Premium Translation will not commit with four of five validated'
);

-- Validate the fifth.
update public.lesson_activity_answers
set answer_data = jsonb_build_object('serverValidated', true, 'validationSource', 'ai')
where lesson_session_id = current_setting('aiko.paid_session')::uuid
  and phase = 'grammar_translation';

insert into public.lesson_activity_answers (
  user_id, lesson_session_id, phase, activity_id, selected_answer, correct, attempts, answer_data
)
select current_setting('aiko.paid')::uuid, current_setting('aiko.paid_session')::uuid,
       'grammar_translation', question.id::text, '駅に行きます。', true, 1,
       jsonb_build_object('serverValidated', true, 'validationSource', 'ai')
from public.lesson_translation_questions question
where question.lesson_session_id = current_setting('aiko.paid_session')::uuid
  and not exists (
    select 1 from public.lesson_activity_answers answer
    where answer.lesson_session_id = question.lesson_session_id
      and answer.phase = 'grammar_translation'
      and answer.activity_id = question.id::text
  );

select is(
  (select count(*)::int from public.lesson_activity_answers
   where lesson_session_id = current_setting('aiko.paid_session')::uuid
     and phase = 'grammar_translation'
     and (answer_data ->> 'serverValidated')::boolean),
  5,
  'the Premium fixture now carries five serverValidated Translations'
);

-- Translation is now committed on its own evidence, after Grammar.
select is(
  (pg_temp.commit_phase(current_setting('aiko.paid')::uuid,
                        current_setting('aiko.paid_session')::uuid, 'translation') ->> 'committed'),
  'true',
  'Premium Translation commits separately on its five validated answers'
);
select is(
  (select commit_source from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.paid_session')::uuid
     and phase = 'translation'),
  'canonical',
  'the Premium Translation commit is canonical'
);

select ok(
  (select mastery_event_count from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.paid_session')::uuid and phase = 'grammar') > 0,
  'the Premium Grammar commit carries canonical mastery evidence'
);

select ok(
  pg_temp.earned_mastery(current_setting('aiko.paid')::uuid) > 0,
  'the Premium learner earned mastery from the completed Grammar phase'
);

select * from finish();
rollback;
