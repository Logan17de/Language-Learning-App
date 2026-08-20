-- /learn product-contract behavioral regression suite.
-- Requires repository migrations through 20260820023100.
-- All synthetic learner/request/session data is transaction-local and rolled back.

begin;

select set_config('aiko.free_user', gen_random_uuid()::text, true);
select set_config('aiko.paid_user', gen_random_uuid()::text, true);
select set_config('aiko.score_user', gen_random_uuid()::text, true);
select set_config('aiko.resume_session', gen_random_uuid()::text, true);
select set_config('aiko.score_session', gen_random_uuid()::text, true);

-- Use the real historical regression shape: 13 Vocabulary rows and 10-13
-- Grammar rows. Only the first playable 7 may affect mastery/completion.
select set_config('aiko.lesson', fixture.lesson_id::text, true),
       set_config('aiko.version', fixture.lesson_version_id::text, true)
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
    and (
      select count(*)
      from public.lesson_reading_questions question
      where question.lesson_version_id = assignment.lesson_version_id
    ) >= 5
  order by assignment.created_at desc
  limit 1
) fixture;

do $$
begin
  if current_setting('aiko.lesson', true) is null
     or current_setting('aiko.version', true) is null then
    raise exception 'Historical 13 Vocabulary / 10-13 Grammar fixture is required';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
) values
  (
    current_setting('aiko.free_user')::uuid,
    'authenticated', 'authenticated',
    'learn-free-' || replace(current_setting('aiko.free_user'), '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  ),
  (
    current_setting('aiko.paid_user')::uuid,
    'authenticated', 'authenticated',
    'learn-paid-' || replace(current_setting('aiko.paid_user'), '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  ),
  (
    current_setting('aiko.score_user')::uuid,
    'authenticated', 'authenticated',
    'learn-score-' || replace(current_setting('aiko.score_user'), '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  );

update public.profiles
set status = 'active', timezone = 'UTC'
where id in (
  current_setting('aiko.free_user')::uuid,
  current_setting('aiko.paid_user')::uuid,
  current_setting('aiko.score_user')::uuid
);
update public.profiles
set subscription_plan = 'premium'
where id = current_setting('aiko.paid_user')::uuid;

-- Prior-day unfinished Free lesson must remain resumable while today's new
-- creation slot is available.
insert into public.custom_lesson_requests (
  user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
  status, generated_lesson_id, entitlement_local_date, entitlement_timezone,
  uses_free_daily_entitlement, entitlement_consumed_at, created_at, updated_at
) values (
  current_setting('aiko.free_user')::uuid,
  'Prior day resume fixture', 'N5', 30, 'balanced', 'medium',
  'approved', current_setting('aiko.lesson')::uuid,
  (now() at time zone 'UTC')::date - 1, 'UTC', true, now() - interval '1 day',
  now() - interval '1 day', now() - interval '1 day'
);

insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version,
  assigned_at, started_at
) values (
  current_setting('aiko.free_user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'custom_topic', 'started', 'product-contract-resume-test',
  now() - interval '1 day', now() - interval '1 day'
);

insert into public.lesson_sessions (
  id, user_id, lesson_id, lesson_version_id, status, current_phase,
  current_phase_index, activity_index, elapsed_seconds, checkpoint,
  started_at, last_saved_at
) values (
  current_setting('aiko.resume_session')::uuid,
  current_setting('aiko.free_user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'active', 'vocabulary', 1, 0, 0,
  jsonb_build_object('session', jsonb_build_object(
    'lessonId', current_setting('aiko.lesson'),
    'completedPhaseIds', jsonb_build_array('story'),
    'storyComplete', true,
    'currentPhaseIndex', 1,
    'activityIndex', 0,
    'completed', false
  )),
  now() - interval '1 day', now() - interval '1 day'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.free_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare s jsonb;
begin
  s := public.get_lesson_creation_state();
  if (s ->> 'daily_limit')::integer <> 1
     or (s ->> 'creations_today')::integer <> 0
     or coalesce((s ->> 'can_create')::boolean, false) is not true then
    raise exception 'Free prior-day lesson incorrectly consumed today allowance: %', s;
  end if;
  if s ->> 'resume_lesson_id' <> current_setting('aiko.lesson')
     or s ->> 'resume_lesson_state' <> 'active' then
    raise exception 'Prior-day unfinished lesson was not independently resumable: %', s;
  end if;
end
$$;
reset role;

-- Same-day Free request consumes the 1/day allowance but must not hide Resume.
insert into public.custom_lesson_requests (
  user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
  status, entitlement_local_date, entitlement_timezone,
  uses_free_daily_entitlement, created_at, updated_at
) values (
  current_setting('aiko.free_user')::uuid,
  'Today free allowance fixture', 'N5', 30, 'balanced', 'medium',
  'generation_pending', (now() at time zone 'UTC')::date, 'UTC', true, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.free_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare s jsonb;
begin
  s := public.get_lesson_creation_state();
  if (s ->> 'daily_limit')::integer <> 1
     or (s ->> 'creations_today')::integer <> 1
     or coalesce((s ->> 'can_create')::boolean, true) is not false then
    raise exception 'Free 1/day limit is not enforced in creation state: %', s;
  end if;
  if s ->> 'resume_lesson_id' <> current_setting('aiko.lesson') then
    raise exception 'Same-day quota state hid prior resumable lesson: %', s;
  end if;
end
$$;
reset role;

-- Premium = five new lessons/day. Four keeps Start new enabled; five disables it.
insert into public.custom_lesson_requests (
  user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
  status, entitlement_local_date, entitlement_timezone,
  uses_free_daily_entitlement, created_at, updated_at
)
select
  current_setting('aiko.paid_user')::uuid,
  'Paid quota fixture ' || n,
  'N5', 30, 'balanced', 'medium', 'generation_pending',
  (now() at time zone 'UTC')::date, 'UTC', false,
  now() - make_interval(mins => 10 - n), now()
from generate_series(1,4) n;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.paid_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare s jsonb;
begin
  s := public.get_lesson_creation_state();
  if (s ->> 'daily_limit')::integer <> 5
     or (s ->> 'creations_today')::integer <> 4
     or coalesce((s ->> 'can_create')::boolean, false) is not true then
    raise exception 'Paid 4/5 allowance state is wrong: %', s;
  end if;
end
$$;
reset role;

insert into public.custom_lesson_requests (
  user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
  status, entitlement_local_date, entitlement_timezone,
  uses_free_daily_entitlement, created_at, updated_at
) values (
  current_setting('aiko.paid_user')::uuid,
  'Paid quota fixture 5', 'N5', 30, 'balanced', 'medium',
  'generation_pending', (now() at time zone 'UTC')::date, 'UTC', false, now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.paid_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
declare s jsonb;
begin
  s := public.get_lesson_creation_state();
  if (s ->> 'creations_today')::integer <> 5
     or coalesce((s ->> 'can_create')::boolean, true) is not false then
    raise exception 'Paid 5/5 limit is not enforced: %', s;
  end if;
end
$$;
reset role;

-- Free learners cannot directly read protected Translation question payloads.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.free_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $$
begin
  begin
    perform 1 from public.lesson_translation_questions limit 1;
    raise exception 'Free learner can directly SELECT Translation question payloads';
  exception
    when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Final canonical Free completion: exactly the first playable 7 Vocabulary + 7
-- Grammar + 5 Reading answers are correct. Extra historical Vocabulary/Grammar
-- rows are deliberately answered incorrectly and must remain inert. No
-- Translation/Listening/Speaking evidence is supplied.
insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status, algorithm_version,
  assigned_at, started_at
) values (
  current_setting('aiko.score_user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'custom_topic', 'started', 'product-contract-score-test', now(), now()
);

insert into public.lesson_sessions (
  id, user_id, lesson_id, lesson_version_id, status, current_phase,
  current_phase_index, activity_index, elapsed_seconds, checkpoint,
  started_at, last_saved_at
)
select
  current_setting('aiko.score_session')::uuid,
  current_setting('aiko.score_user')::uuid,
  current_setting('aiko.lesson')::uuid,
  current_setting('aiko.version')::uuid,
  'active', 'speaking', 5, 0, 0,
  jsonb_build_object(
    'session',
    jsonb_build_object(
      'lessonId', current_setting('aiko.lesson'),
      'storyComplete', true,
      'completedPhaseIds', jsonb_build_array('story','vocabulary','grammar','reading','listening','speaking'),
      'readingAnswers', (
        select jsonb_agg(jsonb_build_object('questionId', question.id::text, 'response', question.answer) order by question.position, question.id)
        from (
          select *
          from public.lesson_reading_questions question
          where question.lesson_version_id = current_setting('aiko.version')::uuid
          order by question.position, question.id
          limit 5
        ) question
      ),
      'completed', false
    )
  ),
  now() - interval '10 minutes', now();

insert into public.lesson_activity_answers (
  user_id, lesson_session_id, phase, activity_id, selected_answer,
  correct, attempts, answer_data
)
select
  current_setting('aiko.score_user')::uuid,
  current_setting('aiko.score_session')::uuid,
  activity.phase,
  activity.id::text,
  case when row_number() over (partition by activity.phase order by activity.position, activity.id) <= 7
    then activity.correct_answer
    else '__deliberately_wrong_hidden_row__'
  end,
  false,
  1,
  '{}'::jsonb
from public.lesson_practice_activities activity
where activity.lesson_version_id = current_setting('aiko.version')::uuid
  and activity.phase in ('vocabulary','grammar');

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.score_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'aiko.completion_result',
  public.complete_lesson_session(
    current_setting('aiko.score_session')::uuid,
    1,
    999,
    1440,
    jsonb_build_object('clientScore', 1, 'clientXp', 999, 'clientDuration', 1440)
  )::text,
  true
);

do $$
declare r jsonb := current_setting('aiko.completion_result')::jsonb;
begin
  if coalesce((r ->> 'canonical')::boolean, false) is not true then
    raise exception 'Canonical completion was not returned: %', r;
  end if;
  if r -> 'phase_scores' ->> 'vocabulary' <> '100'
     or r -> 'phase_scores' ->> 'grammar' <> '100'
     or r -> 'phase_scores' ->> 'reading' <> '100' then
    raise exception 'Hidden historical rows affected playable phase scoring: %', r;
  end if;
  if (r ->> 'xp_awarded')::integer <> public.calculate_lesson_xp((r ->> 'score')::integer) then
    raise exception 'Canonical XP does not derive from canonical score: %', r;
  end if;
  if (r ->> 'xp_awarded')::integer = 999
     or (r ->> 'duration_minutes')::integer = 1440 then
    raise exception 'Client reward/duration forgery survived canonical completion: %', r;
  end if;
  if r -> 'phase_scores' -> 'listening' <> 'null'::jsonb
     or r -> 'phase_scores' -> 'speaking' <> 'null'::jsonb then
    raise exception 'Protected phases affected Free canonical score: %', r;
  end if;
end
$$;
reset role;

select 'learn product contract behavior passed' as result;
rollback;
