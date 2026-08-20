-- Behavioral regression suite for the /learn security and entitlement contract.
-- Run against a database with all repository migrations applied. Every fixture
-- is transaction-local and rolled back, so this is safe against a linked test
-- database when executed as a privileged migration/test connection.

begin;

-- ---------------------------------------------------------------------------
-- Test identities. auth.users creation exercises the real profile trigger.
-- ---------------------------------------------------------------------------
select set_config('aiko.test_quota_user', gen_random_uuid()::text, true);
select set_config('aiko.test_private_owner', gen_random_uuid()::text, true);
select set_config('aiko.test_private_requester', gen_random_uuid()::text, true);
select set_config('aiko.test_score_user', gen_random_uuid()::text, true);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    current_setting('aiko.test_quota_user')::uuid,
    'authenticated',
    'authenticated',
    'learn-quota-' || replace(current_setting('aiko.test_quota_user'), '-', '') || '@invalid.local',
    '{"timezone":"Pacific/Kiritimati"}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('aiko.test_private_owner')::uuid,
    'authenticated',
    'authenticated',
    'learn-owner-' || replace(current_setting('aiko.test_private_owner'), '-', '') || '@invalid.local',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('aiko.test_private_requester')::uuid,
    'authenticated',
    'authenticated',
    'learn-requester-' || replace(current_setting('aiko.test_private_requester'), '-', '') || '@invalid.local',
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    current_setting('aiko.test_score_user')::uuid,
    'authenticated',
    'authenticated',
    'learn-score-' || replace(current_setting('aiko.test_score_user'), '-', '') || '@invalid.local',
    '{}'::jsonb,
    now(),
    now()
  );

-- ---------------------------------------------------------------------------
-- Profile privilege boundary + protected Premium data + retired assignment RPC.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_quota_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    execute $sql$
      update public.profiles
      set subscription_plan = 'premium_monthly'
      where id = auth.uid()
    $sql$;
    raise exception 'authenticated learner changed subscription_plan directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute $sql$
      update public.profiles
      set xp = xp + 999
      where id = auth.uid()
    $sql$;
    raise exception 'authenticated learner changed xp directly';
  exception
    when insufficient_privilege then null;
  end;

  begin
    execute $sql$
      update public.profiles
      set streak_days = streak_days + 50
      where id = auth.uid()
    $sql$;
    raise exception 'authenticated learner changed streak_days directly';
  exception
    when insufficient_privilege then null;
  end;

  if has_function_privilege(current_user, 'public.assign_next_lesson()', 'EXECUTE') then
    raise exception 'authenticated learner can still execute assign_next_lesson()';
  end if;

  if (select count(*) from public.lesson_listening_activities) <> 0 then
    raise exception 'free learner can SELECT protected listening activities';
  end if;

  if (select count(*) from public.lesson_speaking_activities) <> 0 then
    raise exception 'free learner can SELECT protected speaking activities';
  end if;

  if (select count(*) from public.audio_assets) <> 0 then
    raise exception 'free learner can SELECT protected audio assets';
  end if;

  if (select count(*) from storage.objects where bucket_id = 'lesson-audio') <> 0 then
    raise exception 'free learner can SELECT lesson-audio storage objects';
  end if;
end
$$;

-- User-editable profile fields must remain editable.
update public.profiles
set timezone = 'Pacific/Kiritimati'
where id = auth.uid();

do $$
begin
  if (select timezone from public.profiles where id = auth.uid()) <> 'Pacific/Kiritimati' then
    raise exception 'timezone is no longer user-editable';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Daily entitlement: first request freezes reset timezone; changing profile
-- timezone across an actual date boundary must resume the same free request.
-- ---------------------------------------------------------------------------
select set_config(
  'aiko.test_first_begin',
  public.begin_custom_lesson_generation_v5(
    'aiko quota behavior ' || current_setting('aiko.test_quota_user'),
    'N5'
  )::text,
  true
);
select set_config(
  'aiko.test_first_request',
  current_setting('aiko.test_first_begin')::jsonb ->> 'request_id',
  true
);

update public.profiles
set timezone = 'Pacific/Honolulu'
where id = auth.uid();

select set_config(
  'aiko.test_second_begin',
  public.begin_custom_lesson_generation_v5(
    'a completely different topic ' || current_setting('aiko.test_quota_user'),
    'N5'
  )::text,
  true
);

do $$
declare
  request_row public.custom_lesson_requests%rowtype;
begin
  if current_setting('aiko.test_first_request')
     <> current_setting('aiko.test_second_begin')::jsonb ->> 'request_id' then
    raise exception 'timezone change created a second free lesson request';
  end if;

  select *
  into request_row
  from public.custom_lesson_requests
  where id = current_setting('aiko.test_first_request')::uuid;

  if request_row.entitlement_timezone <> 'Pacific/Kiritimati' then
    raise exception 'daily entitlement timezone moved to %', request_row.entitlement_timezone;
  end if;

  if request_row.entitlement_local_date
     <> (now() at time zone 'Pacific/Kiritimati')::date then
    raise exception 'daily entitlement date no longer follows frozen timezone';
  end if;

  -- These zones straddle the date boundary for the regression scenario. If the
  -- wall clock changes enough for them to match, the stable-timezone assertions
  -- above still prove the quota behavior without making the test time-sensitive.
end
$$;

reset role;

-- The partial unique index is the final concurrency backstop even if two
-- transactions race around application code. A second live free entitlement
-- for the same learner/local date must be rejected by PostgreSQL itself.
do $$
declare
  request_row public.custom_lesson_requests%rowtype;
begin
  select *
  into request_row
  from public.custom_lesson_requests
  where id = current_setting('aiko.test_first_request')::uuid;

  begin
    insert into public.custom_lesson_requests (
      user_id,
      topic,
      jlpt_level,
      duration_minutes,
      focus,
      speaking_difficulty,
      note,
      status,
      entitlement_local_date,
      entitlement_timezone,
      uses_free_daily_entitlement
    ) values (
      request_row.user_id,
      'concurrent duplicate should fail',
      request_row.jlpt_level,
      30,
      'balanced',
      'medium',
      '',
      'requested',
      request_row.entitlement_local_date,
      request_row.entitlement_timezone,
      true
    );
    raise exception 'database accepted two live free entitlements for one local day';
  exception
    when unique_violation then null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Story boundary acknowledgement: a malformed/misflagged free request must
-- return false; a valid free request must return true only after consumption is
-- actually persisted.
-- ---------------------------------------------------------------------------
update public.custom_lesson_requests
set uses_free_daily_entitlement = false,
    entitlement_consumed_at = null
where id = current_setting('aiko.test_first_request')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_quota_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if public.consume_custom_lesson_story_entitlement(
    current_setting('aiko.test_first_request')::uuid
  ) then
    raise exception 'misflagged free request received Story entitlement acknowledgement';
  end if;
end
$$;

reset role;

update public.custom_lesson_requests
set uses_free_daily_entitlement = true,
    entitlement_consumed_at = null
where id = current_setting('aiko.test_first_request')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_quota_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if not public.consume_custom_lesson_story_entitlement(
    current_setting('aiko.test_first_request')::uuid
  ) then
    raise exception 'valid free Story entitlement was not acknowledged';
  end if;

  if not exists (
    select 1
    from public.custom_lesson_requests
    where id = current_setting('aiko.test_first_request')::uuid
      and entitlement_consumed_at is not null
  ) then
    raise exception 'Story acknowledgement returned before entitlement consumption persisted';
  end if;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Legacy assignment retirement: active standard assignments are invalid even
-- if somebody attempts to recreate one outside the old RPC.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.lesson_assignments (
      user_id,
      lesson_id,
      lesson_version_id,
      selection_mode,
      status,
      algorithm_version
    )
    select
      current_setting('aiko.test_quota_user')::uuid,
      lesson.id,
      lesson.current_version_id,
      'standard',
      'assigned',
      'behavior-regression'
    from public.lessons lesson
    where lesson.current_version_id is not null
    limit 1;
    raise exception 'active standard assignment was accepted';
  exception
    when check_violation then null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Exact reuse ownership: another learner's private reusable lesson must never
-- be selected for the requesting learner.
-- ---------------------------------------------------------------------------
select set_config('aiko.test_private_lesson', gen_random_uuid()::text, true);
select set_config('aiko.test_private_version', gen_random_uuid()::text, true);
select set_config(
  'aiko.test_private_topic',
  'aiko-private-reuse-' || replace(gen_random_uuid()::text, '-', ''),
  true
);

insert into public.lessons (
  id,
  slug,
  title,
  japanese_title,
  summary,
  topic,
  jlpt_level,
  duration_minutes,
  status,
  source,
  tags,
  published_at,
  generated_for_user_id,
  normalized_topic,
  content_signature,
  reusable
) values (
  current_setting('aiko.test_private_lesson')::uuid,
  'behavior-' || replace(current_setting('aiko.test_private_lesson'), '-', ''),
  'Private behavior lesson',
  'テスト',
  'Ownership regression fixture',
  current_setting('aiko.test_private_topic'),
  'N5',
  30,
  'published',
  'generated',
  '{}',
  now(),
  current_setting('aiko.test_private_owner')::uuid,
  public.normalize_lesson_topic(current_setting('aiko.test_private_topic')),
  'private-behavior-' || current_setting('aiko.test_private_lesson'),
  true
);

insert into public.lesson_versions (
  id,
  lesson_id,
  version_number,
  status,
  phases,
  published_at
) values (
  current_setting('aiko.test_private_version')::uuid,
  current_setting('aiko.test_private_lesson')::uuid,
  1,
  'published',
  '[]'::jsonb,
  now()
);

update public.lessons
set current_version_id = current_setting('aiko.test_private_version')::uuid
where id = current_setting('aiko.test_private_lesson')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_private_requester'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'aiko.test_private_reuse_result',
  public.begin_custom_lesson_generation_v5(
    current_setting('aiko.test_private_topic'),
    'N5'
  )::text,
  true
);

do $$
declare
  result jsonb := current_setting('aiko.test_private_reuse_result')::jsonb;
begin
  if coalesce((result ->> 'reused')::boolean, false) then
    raise exception 'another learner private lesson was reused';
  end if;

  if result ->> 'lesson_id' is not null then
    raise exception 'another learner private lesson leaked into generation result: %', result;
  end if;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Canonical scoring/reward behavior. Deliberately persist wrong answers while
-- forging correct=true, p_score=100, p_xp=999 and p_duration=1440. The database
-- must recompute score/XP/duration from canonical lesson evidence.
-- ---------------------------------------------------------------------------
do $$
declare
  test_user uuid := current_setting('aiko.test_score_user')::uuid;
  lesson_id uuid;
  version_id uuid;
  lesson_duration integer;
  session_id uuid := gen_random_uuid();
  grammar_id uuid;
  grammar_pattern text;
  grammar_meaning text;
  reading_answers jsonb;
begin
  select
    lesson.id,
    lesson.current_version_id,
    lesson.duration_minutes
  into lesson_id, version_id, lesson_duration
  from public.lessons lesson
  where lesson.status = 'published'
    and lesson.current_version_id is not null
    and (select count(*) from public.lesson_practice_activities p where p.lesson_version_id = lesson.current_version_id and p.phase = 'vocabulary') = 7
    and (select count(*) from public.lesson_practice_activities p where p.lesson_version_id = lesson.current_version_id and p.phase = 'grammar') = 7
    and (select count(*) from public.lesson_reading_questions q where q.lesson_version_id = lesson.current_version_id) = 5
    and (select count(*) from public.lesson_listening_activities q where q.lesson_version_id = lesson.current_version_id) = 5
    and (select count(*) from public.lesson_speaking_activities q where q.lesson_version_id = lesson.current_version_id) = 5
    and exists (
      select 1
      from public.lesson_story_words word
      where word.lesson_version_id = lesson.current_version_id
    )
  order by lesson.published_at desc nulls last
  limit 1;

  if lesson_id is null or version_id is null then
    raise exception 'canonical 7/7/5/5/5 lesson fixture is required';
  end if;

  select grammar.id, grammar.pattern, grammar.meaning
  into grammar_id, grammar_pattern, grammar_meaning
  from public.grammar_records grammar
  where grammar.archived_at is null
    and btrim(grammar.pattern) <> ''
    and btrim(grammar.meaning) <> ''
  limit 1;

  if grammar_id is null then
    raise exception 'grammar fixture is required';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'questionId', question.id::text,
      'response', '__aiko_definitely_wrong__'
    )
    order by question.position
  )
  into reading_answers
  from public.lesson_reading_questions question
  where question.lesson_version_id = version_id;

  insert into public.lesson_assignments (
    user_id,
    lesson_id,
    lesson_version_id,
    selection_mode,
    status,
    algorithm_version
  ) values (
    test_user,
    lesson_id,
    version_id,
    'custom_topic',
    'started',
    'canonical-score-behavior-test'
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
  ) values (
    session_id,
    test_user,
    lesson_id,
    version_id,
    'active',
    'speaking',
    5,
    0,
    999999,
    jsonb_build_object(
      'session',
      jsonb_build_object(
        'storyComplete', true,
        'readingAnswers', reading_answers,
        'completed', true
      )
    ),
    now() - interval '7 minutes',
    now()
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
    test_user,
    session_id,
    'vocabulary',
    activity.id::text,
    '__aiko_definitely_wrong__',
    true,
    1,
    '{}'::jsonb
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = version_id
    and activity.phase = 'vocabulary';

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
    test_user,
    session_id,
    'grammar',
    activity.id::text,
    '__aiko_definitely_wrong__',
    true,
    1,
    '{}'::jsonb
  from public.lesson_practice_activities activity
  where activity.lesson_version_id = version_id
    and activity.phase = 'grammar';

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
    test_user,
    session_id,
    lesson_id,
    version_id,
    position,
    'Behavior test translation ' || position,
    grammar_id,
    grammar_pattern,
    grammar_meaning,
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
    test_user,
    session_id,
    'grammar_translation',
    question.id::text,
    '__aiko_definitely_wrong__',
    false,
    1,
    jsonb_build_object(
      'serverValidated', true,
      'targetItemId', grammar_id
    )
  from public.lesson_translation_questions question
  where question.lesson_session_id = session_id;

  perform set_config('aiko.test_score_session', session_id::text, true);
  perform set_config('aiko.test_score_lesson', lesson_id::text, true);
  perform set_config('aiko.test_score_duration_cap', least(120, greatest(1, lesson_duration * 2))::text, true);
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_score_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'aiko.test_score_result',
  public.complete_lesson_session(
    current_setting('aiko.test_score_session')::uuid,
    100,
    999,
    1440,
    jsonb_build_object(
      'result',
      jsonb_build_object(
        'score', 100,
        'xpGained', 999,
        'durationMinutes', 1440
      )
    )
  )::text,
  true
);

do $$
declare
  result jsonb := current_setting('aiko.test_score_result')::jsonb;
  repeat_result jsonb;
  canonical_score integer := (result ->> 'score')::integer;
  canonical_xp integer := (result ->> 'xp_awarded')::integer;
  canonical_duration integer := (result ->> 'duration_minutes')::integer;
begin
  if result ->> 'canonical' <> 'true' then
    raise exception 'completion RPC did not return canonical result marker: %', result;
  end if;

  if canonical_score = 100 then
    raise exception 'forged p_score=100 was trusted despite deliberately wrong answers';
  end if;

  if canonical_xp <> public.calculate_lesson_xp(canonical_score) then
    raise exception 'XP was not derived from canonical score';
  end if;

  if canonical_xp = 999 then
    raise exception 'forged p_xp=999 was trusted';
  end if;

  if canonical_duration = 1440
     or canonical_duration > current_setting('aiko.test_score_duration_cap')::integer then
    raise exception 'forged duration was trusted: %', canonical_duration;
  end if;

  if coalesce((result ->> 'premium_phases_included')::boolean, true) then
    raise exception 'free learner completion included Premium phase weights';
  end if;

  if (select xp from public.profiles where id = auth.uid()) <> canonical_xp then
    raise exception 'profile XP delta does not match canonical reward';
  end if;

  if (select total_study_minutes from public.profiles where id = auth.uid()) <> canonical_duration then
    raise exception 'profile study minutes do not match canonical duration';
  end if;

  if not exists (
    select 1
    from public.lesson_completions completion
    where completion.lesson_session_id = current_setting('aiko.test_score_session')::uuid
      and completion.score = canonical_score
      and completion.xp_awarded = canonical_xp
      and completion.duration_minutes = canonical_duration
  ) then
    raise exception 'canonical lesson completion row was not persisted';
  end if;

  repeat_result := public.complete_lesson_session(
    current_setting('aiko.test_score_session')::uuid,
    0,
    0,
    0,
    '{}'::jsonb
  );

  if repeat_result <> result then
    raise exception 'idempotent completion retry changed canonical result';
  end if;

  if (select xp from public.profiles where id = auth.uid()) <> canonical_xp then
    raise exception 'idempotent completion retry awarded XP twice';
  end if;
end
$$;

reset role;

select 'learn security behavior passed' as result;
rollback;
