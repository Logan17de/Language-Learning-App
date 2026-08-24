-- Whole-section skips are explicit, ordered, zero-scoring phase commits.
-- Hermetic: all fixtures are rolled back after the pgTAP assertions.

begin;
create extension if not exists pgtap;
select plan(10);

create or replace function pg_temp.make_skip_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (
    id, aud, role, email, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated',
    'skip-' || replace(v_user::text, '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  );
  update public.profiles
  set subscription_plan = 'free', status = 'active', timezone = 'UTC'
  where id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.make_skip_lesson(p_user uuid)
returns uuid language plpgsql as $$
declare v_lesson uuid := gen_random_uuid(); v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'skip-' || replace(v_lesson::text, '-', ''),
    'Skip fixture', 'スキップ', 'Hermetic whole-section skip fixture.',
    'skip fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;
  return v_lesson;
end $$;

create or replace function pg_temp.start_skip_session(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare v_session uuid := gen_random_uuid(); v_version uuid;
begin
  select current_version_id into v_version
  from public.lessons where id = p_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status,
    algorithm_version
  ) values (
    p_user, p_lesson, v_version, 'custom_topic', 'started',
    'section-skip-behavior-test'
  );
  insert into public.lesson_sessions (
    id, user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint
  ) values (
    v_session, p_user, p_lesson, v_version, 'active', 'story', 0, 0, 0,
    jsonb_build_object('session', jsonb_build_object(
      'lessonId', p_lesson,
      'currentPhaseIndex', 0,
      'completedPhaseIds', '[]'::jsonb,
      'skippedPhaseIds', '[]'::jsonb
    ))
  );
  return v_session;
end $$;

create or replace function pg_temp.skip_phase(
  p_user uuid,
  p_session uuid,
  p_phase text
)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.skip_lesson_phase(p_session, p_phase) into v_result;
  return v_result;
end $$;

select set_config('aiko.user', pg_temp.make_skip_learner()::text, true);
select set_config(
  'aiko.lesson',
  pg_temp.make_skip_lesson(current_setting('aiko.user')::uuid)::text,
  true
);
select set_config(
  'aiko.session',
  pg_temp.start_skip_session(
    current_setting('aiko.user')::uuid,
    current_setting('aiko.lesson')::uuid
  )::text,
  true
);

select is(
  (pg_temp.skip_phase(
    current_setting('aiko.user')::uuid,
    current_setting('aiko.session')::uuid,
    'story'
  ) ->> 'nextPhase'),
  'vocabulary',
  'skipping Story advances to Vocabulary'
);
select pg_temp.skip_phase(current_setting('aiko.user')::uuid,
                          current_setting('aiko.session')::uuid, 'vocabulary');
select pg_temp.skip_phase(current_setting('aiko.user')::uuid,
                          current_setting('aiko.session')::uuid, 'grammar');
select pg_temp.skip_phase(current_setting('aiko.user')::uuid,
                          current_setting('aiko.session')::uuid, 'reading');
select pg_temp.skip_phase(current_setting('aiko.user')::uuid,
                          current_setting('aiko.session')::uuid, 'listening');
select pg_temp.skip_phase(current_setting('aiko.user')::uuid,
                          current_setting('aiko.session')::uuid, 'speaking');

select is(
  (select count(*)::integer from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid),
  6,
  'all six sections receive one durable commit'
);
select is(
  (select count(*)::integer from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid
     and commit_source = 'skipped'),
  6,
  'every skipped section is explicitly marked'
);
select is(
  (select coalesce(sum(mastery_event_count), 0)::integer
   from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.session')::uuid),
  0,
  'skipped sections create no mastery evidence'
);
select is(
  (select checkpoint -> 'session' ->> 'completionState'
   from public.lesson_sessions
   where id = current_setting('aiko.session')::uuid),
  'completion_pending',
  'skipping the final section enters completion pending'
);
select is(
  (select jsonb_array_length(checkpoint -> 'session' -> 'skippedPhaseIds')
   from public.lesson_sessions
   where id = current_setting('aiko.session')::uuid),
  7,
  'the checkpoint restores all skip markers'
);

select set_config('aiko.completion', (
  select public.complete_lesson_session(
    current_setting('aiko.session')::uuid,
    99,
    999,
    1,
    '{}'::jsonb
  )::text
), true);

select is(
  (current_setting('aiko.completion')::jsonb ->> 'canonical')::boolean,
  true,
  'a lesson with skipped sections still completes canonically'
);
select is(
  (current_setting('aiko.completion')::jsonb ->> 'score')::integer,
  0,
  'seven skipped sections produce a zero lesson score'
);
select is(
  (select score from public.lesson_completions
   where lesson_session_id = current_setting('aiko.session')::uuid),
  0,
  'the persisted completion score is also zero'
);
select ok(
  not has_function_privilege('anon', 'public.skip_lesson_phase(uuid,text)', 'EXECUTE'),
  'anonymous callers cannot skip lesson sections'
);

select * from finish();
rollback;
