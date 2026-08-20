-- Free Translation Skip must commit Grammar from the seven standard answers only.
-- Requires migrations through 20260820023100. Transaction-local fixture only.

begin;

select set_config('aiko.skip_user', gen_random_uuid()::text, true);
select set_config('aiko.skip_session', gen_random_uuid()::text, true);

select set_config('aiko.skip_lesson', fixture.lesson_id::text, true),
       set_config('aiko.skip_version', fixture.lesson_version_id::text, true)
from (
  select assignment.lesson_id, assignment.lesson_version_id
  from public.lesson_assignments assignment
  where assignment.selection_mode = 'custom_topic'
    and (
      select count(*)
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = assignment.lesson_version_id
        and activity.phase = 'grammar'
    ) >= 7
  order by assignment.created_at desc
  limit 1
) fixture;

do $$
begin
  if current_setting('aiko.skip_lesson', true) is null then
    raise exception 'Grammar fixture is required';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
) values (
  current_setting('aiko.skip_user')::uuid,
  'authenticated', 'authenticated',
  'translation-skip-' || replace(current_setting('aiko.skip_user'), '-', '') || '@invalid.local',
  '{}'::jsonb, now(), now()
);

update public.profiles
set status = 'active', subscription_plan = 'free', timezone = 'UTC'
where id = current_setting('aiko.skip_user')::uuid;

insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
) values (
  current_setting('aiko.skip_user')::uuid,
  current_setting('aiko.skip_lesson')::uuid,
  current_setting('aiko.skip_version')::uuid,
  'custom_topic', 'started', 'free-translation-skip-test'
);

insert into public.lesson_sessions (
  id, user_id, lesson_id, lesson_version_id, status, current_phase,
  current_phase_index, activity_index, elapsed_seconds, checkpoint,
  started_at, last_saved_at
) values (
  current_setting('aiko.skip_session')::uuid,
  current_setting('aiko.skip_user')::uuid,
  current_setting('aiko.skip_lesson')::uuid,
  current_setting('aiko.skip_version')::uuid,
  'active', 'grammar', 2, 0, 0,
  jsonb_build_object('session', jsonb_build_object(
    'lessonId', current_setting('aiko.skip_lesson'),
    'storyComplete', true,
    'completedPhaseIds', jsonb_build_array('story','vocabulary'),
    'currentPhaseIndex', 2,
    'activityIndex', 0,
    'grammarAnswers', '[]'::jsonb,
    'completed', false
  )),
  now() - interval '5 minutes', now()
);

insert into public.lesson_phase_mastery_commits (
  lesson_session_id, user_id, phase, mastery_event_count, commit_source
) values
  (
    current_setting('aiko.skip_session')::uuid,
    current_setting('aiko.skip_user')::uuid,
    'story', 0, 'legacy_checkpoint'
  ),
  (
    current_setting('aiko.skip_session')::uuid,
    current_setting('aiko.skip_user')::uuid,
    'vocabulary', 0, 'legacy_checkpoint'
  );

insert into public.lesson_activity_answers (
  user_id, lesson_session_id, phase, activity_id, selected_answer,
  correct, attempts, answer_data
)
select
  current_setting('aiko.skip_user')::uuid,
  current_setting('aiko.skip_session')::uuid,
  'grammar',
  activity.id::text,
  activity.correct_answer,
  false,
  1,
  '{}'::jsonb
from (
  select activity.*
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = current_setting('aiko.skip_version')::uuid
    and activity.phase = 'grammar'
  order by activity.position, activity.id
  limit 7
) activity;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.skip_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'aiko.skip_result',
  public.commit_lesson_phase(
    current_setting('aiko.skip_session')::uuid,
    'grammar'
  )::text,
  true
);

do $$
declare r jsonb := current_setting('aiko.skip_result')::jsonb;
begin
  if r ->> 'committed' <> 'true' or r ->> 'nextPhase' <> 'reading' then
    raise exception 'Free Grammar did not skip Translation into Reading: %', r;
  end if;
  if exists (
    select 1
    from public.lesson_translation_questions question
    where question.user_id = auth.uid()
      and question.lesson_session_id = current_setting('aiko.skip_session')::uuid
  ) then
    raise exception 'Free Skip manufactured Translation questions';
  end if;
  if exists (
    select 1
    from public.learner_mastery_events event
    where event.user_id = auth.uid()
      and event.lesson_session_id = current_setting('aiko.skip_session')::uuid
      and event.event_data ? 'translationQuestionId'
  ) then
    raise exception 'Free Skip awarded Translation mastery';
  end if;
end
$$;

reset role;
select 'free Translation skip behavior passed' as result;
rollback;
