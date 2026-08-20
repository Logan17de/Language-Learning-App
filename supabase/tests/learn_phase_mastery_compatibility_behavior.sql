-- Behavioral regression suite for phase-atomic mastery rollout compatibility.
-- Requires the consolidated 20260820021500_phase_atomic_mastery_resume.sql.
-- All fixtures are transaction-local and rolled back.

begin;

select set_config('aiko.phase_user', gen_random_uuid()::text, true);
select set_config('aiko.legacy_user', gen_random_uuid()::text, true);
select set_config('aiko.phase_session', gen_random_uuid()::text, true);
select set_config('aiko.legacy_session', gen_random_uuid()::text, true);

-- Use the exact historical storage shape from the regression: 13 Vocabulary
-- rows and 10-13 Grammar rows, while the playable UI completes seven of each.
select set_config(
  'aiko.phase_lesson',
  fixture.lesson_id::text,
  true
), set_config(
  'aiko.phase_version',
  fixture.lesson_version_id::text,
  true
)
from (
  select assignment.lesson_id, assignment.lesson_version_id
  from public.lesson_assignments assignment
  where assignment.selection_mode = 'custom_topic'
    and (
      select count(*)
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = assignment.lesson_version_id
        and activity.phase = 'vocabulary'
    ) = 13
    and (
      select count(*)
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = assignment.lesson_version_id
        and activity.phase = 'grammar'
    ) between 10 and 13
    and exists (
      select 1
      from public.lesson_grammar grammar
      where grammar.lesson_version_id = assignment.lesson_version_id
        and grammar.grammar_id is not null
    )
  order by assignment.created_at desc
  limit 1
) fixture;

do $$
begin
  if current_setting('aiko.phase_lesson', true) is null
     or current_setting('aiko.phase_version', true) is null then
    raise exception 'Historical 13 Vocabulary / 10-13 Grammar lesson fixture is required';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
) values
  (
    current_setting('aiko.phase_user')::uuid,
    'authenticated',
    'authenticated',
    'phase-history-' || replace(current_setting('aiko.phase_user'), '-', '') || '@invalid.local',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('aiko.legacy_user')::uuid,
    'authenticated',
    'authenticated',
    'phase-legacy-' || replace(current_setting('aiko.legacy_user'), '-', '') || '@invalid.local',
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version
) values
  (
    current_setting('aiko.phase_user')::uuid,
    current_setting('aiko.phase_lesson')::uuid,
    current_setting('aiko.phase_version')::uuid,
    'custom_topic',
    'started',
    'phase-history-behavior-test'
  ),
  (
    current_setting('aiko.legacy_user')::uuid,
    current_setting('aiko.phase_lesson')::uuid,
    current_setting('aiko.phase_version')::uuid,
    'custom_topic',
    'started',
    'phase-legacy-behavior-test'
  );

insert into public.lesson_sessions (
  id,
  user_id,
  lesson_id,
  lesson_version_id,
  status,
  current_phase,
  current_phase_index,
  activity_index,
  elapsed_seconds,
  checkpoint,
  started_at,
  last_saved_at
) values
  (
    current_setting('aiko.phase_session')::uuid,
    current_setting('aiko.phase_user')::uuid,
    current_setting('aiko.phase_lesson')::uuid,
    current_setting('aiko.phase_version')::uuid,
    'active',
    'vocabulary',
    1,
    0,
    0,
    jsonb_build_object(
      'session',
      jsonb_build_object(
        'lessonId', current_setting('aiko.phase_lesson'),
        'currentPhaseIndex', 1,
        'activityIndex', 0,
        'completedPhaseIds', jsonb_build_array('story'),
        'storyComplete', true,
        'vocabularyAnswers', '[]'::jsonb,
        'grammarAnswers', '[]'::jsonb,
        'readingAnswers', '[]'::jsonb,
        'readingEvents', '[]'::jsonb,
        'readingComplete', false,
        'listeningEvents', '[]'::jsonb,
        'listeningComplete', false,
        'speakingEvents', '[]'::jsonb,
        'speakingComplete', false,
        'completed', false
      )
    ),
    now() - interval '5 minutes',
    now()
  ),
  (
    current_setting('aiko.legacy_session')::uuid,
    current_setting('aiko.legacy_user')::uuid,
    current_setting('aiko.phase_lesson')::uuid,
    current_setting('aiko.phase_version')::uuid,
    'active',
    'vocabulary',
    1,
    0,
    0,
    jsonb_build_object(
      'session',
      jsonb_build_object(
        'lessonId', current_setting('aiko.phase_lesson'),
        'currentPhaseIndex', 1,
        'activityIndex', 0,
        'completedPhaseIds', jsonb_build_array('story'),
        'storyComplete', true,
        'completed', false
      )
    ),
    now() - interval '5 minutes',
    now()
  );

insert into public.lesson_phase_mastery_commits (
  lesson_session_id, user_id, phase, mastery_event_count, commit_source
) values
  (
    current_setting('aiko.phase_session')::uuid,
    current_setting('aiko.phase_user')::uuid,
    'story', 0, 'legacy_checkpoint'
  ),
  (
    current_setting('aiko.legacy_session')::uuid,
    current_setting('aiko.legacy_user')::uuid,
    'story', 0, 'legacy_checkpoint'
  );

insert into public.lesson_activity_answers (
  user_id,
  lesson_session_id,
  phase,
  activity_id,
  selected_answer,
  correct,
  attempts,
  answer_data
)
select
  current_setting('aiko.phase_user')::uuid,
  current_setting('aiko.phase_session')::uuid,
  'vocabulary',
  activity.id::text,
  activity.correct_answer,
  false,
  1,
  '{}'::jsonb
from (
  select activity.*
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = current_setting('aiko.phase_version')::uuid
    and activity.phase = 'vocabulary'
  order by activity.position, activity.id
  limit 7
) activity;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.phase_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config(
  'aiko.vocab_commit',
  public.commit_lesson_phase(
    current_setting('aiko.phase_session')::uuid,
    'vocabulary'
  )::text,
  true
);

do $$
declare
  first_result jsonb := current_setting('aiko.vocab_commit')::jsonb;
  before_events integer;
  after_events integer;
  duplicate_result jsonb;
begin
  if first_result ->> 'committed' <> 'true'
     or first_result ->> 'nextPhase' <> 'grammar' then
    raise exception 'Historical seven-answer Vocabulary commit failed: %', first_result;
  end if;

  select count(*)::integer into before_events
  from public.learner_mastery_events
  where lesson_session_id = current_setting('aiko.phase_session')::uuid;

  duplicate_result := public.commit_lesson_phase(
    current_setting('aiko.phase_session')::uuid,
    'vocabulary'
  );

  select count(*)::integer into after_events
  from public.learner_mastery_events
  where lesson_session_id = current_setting('aiko.phase_session')::uuid;

  if coalesce((duplicate_result ->> 'duplicate')::boolean, false) is not true then
    raise exception 'Duplicate Vocabulary phase commit was not idempotent';
  end if;
  if after_events <> before_events then
    raise exception 'Duplicate Vocabulary commit wrote mastery twice';
  end if;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.learner_mastery_events event
    where event.lesson_session_id = current_setting('aiko.phase_session')::uuid
      and event.event_data ->> 'phase' = 'vocabulary'
      and event.event_data ? 'activityId'
      and not exists (
        select 1
        from public.lesson_activity_answers answer
        where answer.lesson_session_id = current_setting('aiko.phase_session')::uuid
          and answer.phase = 'vocabulary'
          and answer.activity_id = event.event_data ->> 'activityId'
      )
  ) then
    raise exception 'Unanswered historical Vocabulary row influenced mastery';
  end if;
end
$$;

insert into public.lesson_activity_answers (
  user_id,
  lesson_session_id,
  phase,
  activity_id,
  selected_answer,
  correct,
  attempts,
  answer_data
)
select
  current_setting('aiko.phase_user')::uuid,
  current_setting('aiko.phase_session')::uuid,
  'grammar',
  activity.id::text,
  activity.correct_answer,
  false,
  1,
  '{}'::jsonb
from (
  select activity.*
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = current_setting('aiko.phase_version')::uuid
    and activity.phase = 'grammar'
  order by activity.position, activity.id
  limit 7
) activity;

select set_config(
  'aiko.phase_grammar_item',
  grammar.grammar_id::text,
  true
), set_config(
  'aiko.phase_grammar_pattern',
  grammar_record.pattern,
  true
), set_config(
  'aiko.phase_grammar_meaning',
  grammar_record.meaning,
  true
)
from public.lesson_grammar grammar
join public.grammar_records grammar_record on grammar_record.id = grammar.grammar_id
where grammar.lesson_version_id = current_setting('aiko.phase_version')::uuid
  and grammar.grammar_id is not null
limit 1;

insert into public.lesson_translation_questions (
  user_id,
  lesson_session_id,
  lesson_id,
  lesson_version_id,
  position,
  english_prompt,
  target_item_id,
  target_pattern,
  target_meaning,
  target_role,
  model_answer
)
select
  current_setting('aiko.phase_user')::uuid,
  current_setting('aiko.phase_session')::uuid,
  current_setting('aiko.phase_lesson')::uuid,
  current_setting('aiko.phase_version')::uuid,
  position,
  'Historical grammar behavior ' || position,
  current_setting('aiko.phase_grammar_item')::uuid,
  current_setting('aiko.phase_grammar_pattern'),
  current_setting('aiko.phase_grammar_meaning'),
  'lesson_fallback',
  'テストです。'
from generate_series(1, 5) position;

insert into public.lesson_activity_answers (
  user_id,
  lesson_session_id,
  phase,
  activity_id,
  selected_answer,
  correct,
  attempts,
  answer_data
)
select
  current_setting('aiko.phase_user')::uuid,
  current_setting('aiko.phase_session')::uuid,
  'grammar_translation',
  question.id::text,
  question.model_answer,
  true,
  1,
  jsonb_build_object('serverValidated', true)
from public.lesson_translation_questions question
where question.lesson_session_id = current_setting('aiko.phase_session')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.phase_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config(
  'aiko.grammar_commit',
  public.commit_lesson_phase(
    current_setting('aiko.phase_session')::uuid,
    'grammar'
  )::text,
  true
);

do $$
declare
  result jsonb := current_setting('aiko.grammar_commit')::jsonb;
begin
  if result ->> 'committed' <> 'true'
     or result ->> 'nextPhase' <> 'reading' then
    raise exception 'Historical seven-answer Grammar commit failed: %', result;
  end if;
end
$$;

do $$
declare
  before_events integer;
  after_events integer;
  retired_result jsonb;
begin
  select count(*)::integer into before_events
  from public.learner_mastery_events
  where user_id = auth.uid();

  retired_result := public.record_mastery_evidence(
    current_setting('aiko.phase_session')::uuid,
    jsonb_build_array(
      jsonb_build_object(
        'clientEventId', 'forged-mastered-everything',
        'itemType', 'grammar',
        'itemKey', current_setting('aiko.phase_grammar_item'),
        'dimension', 'recognition',
        'signal', 'correct',
        'data', jsonb_build_object('answeredCorrectly', true)
      )
    )
  );

  select count(*)::integer into after_events
  from public.learner_mastery_events
  where user_id = auth.uid();

  if retired_result ->> 'retired' <> 'true' or after_events <> before_events then
    raise exception 'Retired mastery RPC still changes canonical mastery evidence';
  end if;

  begin
    update public.learner_mastery
    set mastery = 100
    where user_id = auth.uid();
    raise exception 'authenticated learner can update learner_mastery';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.learner_mastery_events where user_id = auth.uid();
    raise exception 'authenticated learner can delete mastery event ledger';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute 'truncate table public.learner_mastery_events';
    raise exception 'authenticated learner can truncate mastery event ledger';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

select set_config(
  'aiko.resume_result',
  public.reset_incomplete_lesson_phase(
    current_setting('aiko.phase_session')::uuid
  )::text,
  true
);

do $$
declare
  result jsonb := current_setting('aiko.resume_result')::jsonb;
begin
  if result ->> 'currentPhase' <> 'reading'
     or (result ->> 'currentPhaseIndex')::integer <> 3
     or (result ->> 'activityIndex')::integer <> 0 then
    raise exception 'Resume did not move to Reading activity 0: %', result;
  end if;
end
$$;

reset role;

insert into public.lesson_activity_answers (
  user_id,
  lesson_session_id,
  phase,
  activity_id,
  selected_answer,
  correct,
  attempts,
  answer_data
)
select
  current_setting('aiko.legacy_user')::uuid,
  current_setting('aiko.legacy_session')::uuid,
  'vocabulary',
  activity.id::text,
  activity.correct_answer,
  true,
  1,
  '{}'::jsonb
from (
  select activity.*
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = current_setting('aiko.phase_version')::uuid
    and activity.phase = 'vocabulary'
  order by activity.position, activity.id
  limit 7
) activity;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.legacy_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.record_mastery_evidence(
  current_setting('aiko.legacy_session')::uuid,
  jsonb_build_array(
    jsonb_build_object(
      'clientEventId', 'legacy-client-payload',
      'itemType', 'grammar',
      'itemKey', current_setting('aiko.phase_grammar_item'),
      'dimension', 'recognition',
      'signal', 'correct'
    )
  )
);

update public.lesson_sessions
set current_phase = 'grammar',
    current_phase_index = 2,
    activity_index = 0,
    checkpoint = jsonb_build_object(
      'session',
      jsonb_build_object(
        'lessonId', current_setting('aiko.phase_lesson'),
        'currentPhaseIndex', 2,
        'activityIndex', 0,
        'completedPhaseIds', jsonb_build_array('story','vocabulary'),
        'storyComplete', true,
        'completed', false
      )
    )
where id = current_setting('aiko.legacy_session')::uuid;

do $$
begin
  if not exists (
    select 1
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = current_setting('aiko.legacy_session')::uuid
      and commit.phase = 'vocabulary'
      and commit.commit_source = 'canonical'
  ) then
    raise exception 'Old Production checkpoint did not create canonical Vocabulary commit';
  end if;

  if not exists (
    select 1
    from public.learner_mastery_events event
    where event.lesson_session_id = current_setting('aiko.legacy_session')::uuid
      and event.event_data ->> 'phase' = 'vocabulary'
  ) then
    raise exception 'Old Production checkpoint bridge stopped mastery earning';
  end if;
end
$$;

reset role;
select 'phase mastery compatibility behavior passed' as result;
rollback;
