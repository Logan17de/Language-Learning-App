-- /learn product-contract alignment.
--
-- This migration intentionally follows the pending phase-atomic mastery migration.
-- It keeps the public RPC signatures stable for rollout compatibility while fixing:
--   * daily allowance vs. independent Resume discovery,
--   * Free/Premium Grammar + Translation rules,
--   * historical 10/13 practice rows leaking into canonical completion scoring,
--   * direct authenticated access to server-owned Translation question payloads.
--
-- Generation prompts and generation behavior are deliberately untouched.

-- Translation questions are server-owned payloads. Paid learners use the guarded
-- API routes; no authenticated client needs direct table access.
revoke select, insert, update, delete on table public.lesson_translation_questions
  from anon, authenticated;

-- Daily creation allowance and resumability are separate concepts. Keep the old
-- response keys so the currently promoted Production client can still parse the
-- RPC, while also returning explicit today_* and resume_* fields for the new UI.
create or replace function public.get_lesson_creation_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.custom_lesson_requests%rowtype;
  v_timezone text;
  v_local_date date;
  v_count integer := 0;
  v_lesson_state text := null;
  v_resume_request_id uuid := null;
  v_resume_lesson_id uuid := null;
  v_resume_topic text := null;
  v_resume_level text := null;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_timezone := public.lesson_quota_timezone(auth.uid(), v_profile.timezone);
  v_local_date := (now() at time zone v_timezone)::date;

  if v_profile.subscription_plan = 'free' then
    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_local_date = v_local_date
      and (status <> 'failed' or entitlement_consumed_at is not null)
    order by created_at desc
    limit 1;
  else
    select count(*)::integer into v_count
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and entitlement_local_date = v_local_date
      and status <> 'failed';

    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and entitlement_local_date = v_local_date
      and status <> 'failed'
    order by created_at desc
    limit 1;
  end if;

  if v_request.id is not null then
    if v_request.generated_lesson_id is null then
      if v_request.status <> 'failed' then
        v_lesson_state := 'building';
      end if;
    elsif exists (
      select 1
      from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = v_request.generated_lesson_id
    ) then
      v_lesson_state := 'completed';
    elsif exists (
      select 1
      from public.lesson_sessions session
      where session.user_id = auth.uid()
        and session.lesson_id = v_request.generated_lesson_id
        and session.status = 'active'
    ) then
      v_lesson_state := 'active';
    else
      v_lesson_state := 'ready';
    end if;
  end if;

  -- Resume is intentionally not filtered by entitlement_local_date. The latest
  -- active custom-topic session remains resumable even when it was created on a
  -- previous learner-local day and today's creation allowance has reset.
  select
    request.id,
    session.lesson_id,
    coalesce(request.topic, lesson.topic),
    coalesce(request.jlpt_level::text, lesson.jlpt_level::text)
  into
    v_resume_request_id,
    v_resume_lesson_id,
    v_resume_topic,
    v_resume_level
  from public.lesson_sessions session
  join public.lessons lesson
    on lesson.id = session.lesson_id
  left join lateral (
    select candidate.*
    from public.custom_lesson_requests candidate
    where candidate.user_id = auth.uid()
      and candidate.generated_lesson_id = session.lesson_id
    order by candidate.created_at desc
    limit 1
  ) request on true
  where session.user_id = auth.uid()
    and session.status = 'active'
    and exists (
      select 1
      from public.lesson_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.lesson_id = session.lesson_id
        and assignment.lesson_version_id = session.lesson_version_id
        and assignment.selection_mode = 'custom_topic'
        and assignment.status in ('assigned','started')
    )
  order by session.updated_at desc, session.started_at desc
  limit 1;

  if v_profile.subscription_plan = 'free' then
    return jsonb_build_object(
      'plan', 'free',
      'local_date', v_local_date,
      'timezone', v_timezone,
      'quota_timezone', v_timezone,
      'can_create', v_request.id is null,
      'daily_limit', 1,
      'creations_today', case when v_request.id is null then 0 else 1 end,

      -- Legacy/current-production aliases.
      'request_id', v_request.id,
      'request_status', case when v_request.id is null then null else v_request.status::text end,
      'topic', v_request.topic,
      'level', case when v_request.id is null then null else v_request.jlpt_level::text end,
      'lesson_id', v_request.generated_lesson_id,
      'lesson_state', v_lesson_state,
      'entitlement_consumed', v_request.entitlement_consumed_at is not null,

      -- Explicit new contract.
      'today_request_id', v_request.id,
      'today_request_status', case when v_request.id is null then null else v_request.status::text end,
      'today_topic', v_request.topic,
      'today_level', case when v_request.id is null then null else v_request.jlpt_level::text end,
      'today_lesson_id', v_request.generated_lesson_id,
      'today_lesson_state', v_lesson_state,
      'today_entitlement_consumed', v_request.entitlement_consumed_at is not null,
      'resume_request_id', v_resume_request_id,
      'resume_lesson_id', v_resume_lesson_id,
      'resume_topic', v_resume_topic,
      'resume_level', v_resume_level,
      'resume_lesson_state', case when v_resume_lesson_id is null then null else 'active' end
    );
  end if;

  return jsonb_build_object(
    'plan', 'premium',
    'local_date', v_local_date,
    'timezone', v_timezone,
    'quota_timezone', v_timezone,
    'can_create', v_count < 5,
    'daily_limit', 5,
    'creations_today', v_count,

    -- Legacy/current-production aliases.
    'request_id', v_request.id,
    'request_status', case when v_request.id is null then null else v_request.status::text end,
    'topic', v_request.topic,
    'level', case when v_request.id is null then null else v_request.jlpt_level::text end,
    'lesson_id', v_request.generated_lesson_id,
    'lesson_state', v_lesson_state,
    'entitlement_consumed', false,

    -- Explicit new contract.
    'today_request_id', v_request.id,
    'today_request_status', case when v_request.id is null then null else v_request.status::text end,
    'today_topic', v_request.topic,
    'today_level', case when v_request.id is null then null else v_request.jlpt_level::text end,
    'today_lesson_id', v_request.generated_lesson_id,
    'today_lesson_state', v_lesson_state,
    'today_entitlement_consumed', false,
    'resume_request_id', v_resume_request_id,
    'resume_lesson_id', v_resume_lesson_id,
    'resume_topic', v_resume_topic,
    'resume_level', v_resume_level,
    'resume_lesson_state', case when v_resume_lesson_id is null then null else 'active' end
  );
end;
$$;

-- Override only Vocabulary/Grammar in the phase-atomic engine. Other phases keep
-- the strict implementation installed by 20260820021500.
create or replace function public.commit_lesson_phase(
  p_session_id uuid,
  p_phase text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_phase_index integer;
  v_prior_count integer;
  v_playable_total integer := 0;
  v_answered integer := 0;
  v_translation_total integer := 0;
  v_translation_validated integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_translation_events jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_event_count integer := 0;
  v_offset integer := 0;
  v_state jsonb;
  v_completed text[] := '{}'::text[];
  v_next_phase text;
  v_next_index integer;
  v_premium boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_phase is null or not (p_phase = any(v_phase_order)) then
    raise exception 'Unsupported lesson phase' using errcode = '22023';
  end if;

  if p_phase not in ('vocabulary','grammar') then
    return public.commit_lesson_phase_strict_v1(p_session_id, p_phase);
  end if;

  select * into v_session
  from public.lesson_sessions
  where id = p_session_id
    and user_id = auth.uid()
  for update;

  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = p_phase
  ) then
    select coalesce(
      array_agg(commit.phase order by array_position(v_phase_order, commit.phase)),
      '{}'::text[]
    )
    into v_completed
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id;

    return jsonb_build_object(
      'committed', true,
      'duplicate', true,
      'phase', p_phase,
      'completedPhaseIds', to_jsonb(v_completed)
    );
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active';
  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;
  v_premium :=
    v_profile.subscription_plan <> 'free'
    or v_profile.role in ('admin','content_editor');

  v_phase_index := array_position(v_phase_order, p_phase) - 1;
  if v_phase_index > 0 then
    select count(*)::integer into v_prior_count
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = any(v_phase_order[1:v_phase_index]);
    if v_prior_count <> v_phase_index then
      raise exception 'Previous lesson phase is not committed' using errcode = '55000';
    end if;
  end if;

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;

  if p_phase = 'vocabulary' then
    with playable as (
      select activity.*
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
        and activity.phase = 'vocabulary'
      order by activity.position, activity.id
      limit 7
    )
    select count(*)::integer, count(answer.id)::integer
    into v_playable_total, v_answered
    from playable activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'vocabulary'
     and answer.activity_id = activity.id::text;

    if v_playable_total <> 7 or v_answered <> 7 then
      raise exception 'Vocabulary phase requires exactly 7 playable answers' using errcode = '55000';
    end if;

    with playable as (
      select activity.*
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
        and activity.phase = 'vocabulary'
      order by activity.position, activity.id
      limit 7
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:vocabulary:' || activity.id::text || ':' || target.item_id::text,
      'itemType', public.canonical_mastery_item_type(target.item_id),
      'itemKey', target.item_id::text,
      'dimension', case
        when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
        when activity.mode = 'reading-meaning' then 'meaning'
        else 'recognition'
      end,
      'signal', case
        when public.canonical_lesson_answer_matches(
          answer.selected_answer,
          activity.correct_answer,
          activity.accepted_answers
        ) then 'correct' else 'incorrect' end,
      'data', jsonb_build_object(
        'source','canonical_phase','phase','vocabulary','activityId',activity.id
      )
    )), '[]'::jsonb)
    into v_events
    from playable activity
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'vocabulary'
     and answer.activity_id = activity.id::text
    cross join lateral unnest(activity.target_item_ids) target(item_id)
    where public.canonical_mastery_item_type(target.item_id) is not null;

  else
    with playable as (
      select activity.*
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
        and activity.phase = 'grammar'
      order by activity.position, activity.id
      limit 7
    )
    select count(*)::integer, count(answer.id)::integer
    into v_playable_total, v_answered
    from playable activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = activity.id::text;

    if v_playable_total <> 7 or v_answered <> 7 then
      raise exception 'Grammar phase requires exactly 7 playable answers' using errcode = '55000';
    end if;

    with playable as (
      select activity.*
      from public.lesson_practice_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
        and activity.phase = 'grammar'
      order by activity.position, activity.id
      limit 7
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:grammar:static:' || activity.id::text || ':' || target.item_id::text,
      'itemType', public.canonical_mastery_item_type(target.item_id),
      'itemKey', target.item_id::text,
      'dimension', case
        when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
        else 'meaning'
      end,
      'signal', case
        when public.canonical_lesson_answer_matches(
          answer.selected_answer,
          activity.correct_answer,
          activity.accepted_answers
        ) then 'correct' else 'incorrect' end,
      'data', jsonb_build_object(
        'source','canonical_phase','phase','grammar','activityId',activity.id
      )
    )), '[]'::jsonb)
    into v_events
    from playable activity
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = activity.id::text
    cross join lateral unnest(activity.target_item_ids) target(item_id)
    where public.canonical_mastery_item_type(target.item_id) is not null;

    if v_premium then
      select
        count(*)::integer,
        count(answer.id) filter (
          where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
        )::integer
      into v_translation_total, v_translation_validated
      from public.lesson_translation_questions question
      left join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase = 'grammar_translation'
       and answer.activity_id = question.id::text
      where question.user_id = v_session.user_id
        and question.lesson_session_id = v_session.id
        and question.lesson_id = v_session.lesson_id
        and question.lesson_version_id = v_session.lesson_version_id;

      if v_translation_total <> 5 or v_translation_validated <> 5 then
        raise exception 'Premium Grammar requires exactly 5 validated translations' using errcode = '55000';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'clientEventId', 'canonical:grammar:translation:' || question.id::text || ':' || question.target_item_id::text,
        'itemType', public.canonical_mastery_item_type(question.target_item_id),
        'itemKey', question.target_item_id::text,
        'dimension', 'recognition',
        'signal', case when answer.correct then 'correct' else 'incorrect' end,
        'data', jsonb_build_object(
          'source','canonical_phase',
          'phase','grammar',
          'translationQuestionId',question.id,
          'serverValidated',true
        )
      )), '[]'::jsonb)
      into v_translation_events
      from public.lesson_translation_questions question
      join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase = 'grammar_translation'
       and answer.activity_id = question.id::text
       and coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
      where question.user_id = v_session.user_id
        and question.lesson_session_id = v_session.id
        and question.lesson_id = v_session.lesson_id
        and question.lesson_version_id = v_session.lesson_version_id
        and public.canonical_mastery_item_type(question.target_item_id) is not null;

      v_events := v_events || v_translation_events;
    end if;
  end if;

  v_event_count := jsonb_array_length(v_events);
  while v_offset < v_event_count loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into v_batch
    from jsonb_array_elements(v_events) with ordinality item(value, ordinality)
    where ordinality > v_offset
      and ordinality <= v_offset + 100;

    perform public.apply_canonical_mastery_evidence(p_session_id, v_batch);
    v_offset := v_offset + 100;
  end loop;

  insert into public.lesson_phase_mastery_commits (
    lesson_session_id,
    user_id,
    phase,
    mastery_event_count,
    commit_source
  ) values (
    p_session_id,
    v_session.user_id,
    p_phase,
    v_event_count,
    'canonical'
  );

  select coalesce(
    array_agg(commit.phase order by array_position(v_phase_order, commit.phase)),
    '{}'::text[]
  )
  into v_completed
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id;

  v_next_index := v_phase_index + 1;
  v_next_phase := v_phase_order[v_next_index + 1];

  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionState}', to_jsonb('active'::text), true);
  v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_next_index), true);

  update public.lesson_sessions
  set current_phase = v_next_phase,
      current_phase_index = v_next_index,
      activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint,'{}'::jsonb), '{session}', v_state, true),
      last_saved_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'committed', true,
    'duplicate', false,
    'phase', p_phase,
    'masteryEventCount', v_event_count,
    'completedPhaseIds', to_jsonb(v_completed),
    'nextPhase', v_next_phase,
    'completionPending', false
  );
end;
$$;

revoke all on function public.commit_lesson_phase(uuid,text) from public, anon;
grant execute on function public.commit_lesson_phase(uuid,text) to authenticated;

-- Canonical completion v3. Historical storage rows past the playable contract are
-- ignored. Client score/XP/duration/correct flags remain non-authoritative.
create or replace function public.complete_lesson_session(
  p_session_id uuid,
  p_score integer,
  p_xp integer,
  p_duration_minutes integer,
  p_completion_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_lesson public.lessons%rowtype;
  v_ledger public.reward_ledger%rowtype;
  v_checkpoint jsonb;
  v_result jsonb;
  v_completion_data jsonb;
  v_phase_scores jsonb;
  v_premium boolean := false;

  v_story_total integer := 0;
  v_story_pct numeric := 0;

  v_vocab_total integer := 0;
  v_vocab_answered integer := 0;
  v_vocab_correct integer := 0;
  v_vocab_pct numeric := 0;

  v_grammar_static_total integer := 0;
  v_grammar_static_answered integer := 0;
  v_grammar_static_correct integer := 0;
  v_translation_total integer := 0;
  v_translation_validated integer := 0;
  v_translation_correct integer := 0;
  v_grammar_pct numeric := 0;

  v_reading_total integer := 0;
  v_reading_answered integer := 0;
  v_reading_correct integer := 0;
  v_reading_pct numeric := 0;

  v_listening_total integer := 0;
  v_listening_answered integer := 0;
  v_listening_correct integer := 0;
  v_listening_pct numeric := 0;

  v_speaking_total integer := 0;
  v_speaking_validated integer := 0;
  v_speaking_pct numeric := 0;

  v_score integer;
  v_xp integer;
  v_duration integer;
  v_timezone text;
  v_today date;
  v_last_activity_date date;
  v_current_streak integer;
  v_new_streak integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_completion_data is null or jsonb_typeof(p_completion_data) <> 'object' then
    raise exception 'Completion data is required' using errcode = '22023';
  end if;

  select * into v_session
  from public.lesson_sessions
  where id = p_session_id
  for update;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  select * into v_ledger
  from public.reward_ledger
  where reward_type = 'lesson'
    and source_id = p_session_id;

  if found then
    return v_ledger.canonical_result;
  end if;

  if v_session.status <> 'active' then
    raise exception 'Session is not active' using errcode = '55000';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_session.user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select * into v_lesson
  from public.lessons
  where id = v_session.lesson_id;

  if not found or not exists (
    select 1
    from public.lesson_versions version
    where version.id = v_session.lesson_version_id
      and version.lesson_id = v_session.lesson_id
  ) then
    raise exception 'Lesson version not found' using errcode = 'P0002';
  end if;

  v_premium :=
    v_profile.subscription_plan <> 'free'
    or v_profile.role in ('admin','content_editor');

  v_checkpoint := v_session.checkpoint -> 'session';
  if jsonb_typeof(v_checkpoint) <> 'object'
     or coalesce((v_checkpoint ->> 'storyComplete')::boolean, false) is not true then
    raise exception 'Story must be completed before lesson completion' using errcode = '55000';
  end if;

  select count(*)::integer into v_story_total
  from public.lesson_story_words word
  where word.lesson_version_id = v_session.lesson_version_id;

  if v_story_total = 0 then
    v_story_pct := 100;
  else
    with story_word_scores as (
      select
        word.id,
        greatest(0, least(100,
          word.meaning_score
            - 25 * count(event.id) filter (where event.event_type = 'meaning-revealed')
        )) as meaning_score,
        greatest(0, least(100,
          word.recognition_score
            - 15 * count(event.id) filter (where event.event_type = 'reading-revealed')
            - case when word.script_type <> 'kanji'
                then 25 * count(event.id) filter (where event.event_type = 'meaning-revealed')
                else 0 end
        )) as recognition_score,
        greatest(0, least(100, word.pronunciation_score)) as pronunciation_score
      from public.lesson_story_words word
      left join public.lesson_events event
        on event.user_id = v_session.user_id
       and event.lesson_session_id = v_session.id
       and event.phase = 'story'
       and event.event_type in ('reading-revealed','meaning-revealed')
       and event.event_data ->> 'lineId' = word.story_line_id::text
       and (
         event.event_data ->> 'wordId' = word.id::text
         or (
           coalesce(event.event_data ->> 'wordId','') = ''
           and event.event_data ->> 'term' = word.surface
         )
       )
      where word.lesson_version_id = v_session.lesson_version_id
      group by word.id, word.meaning_score, word.recognition_score,
               word.pronunciation_score, word.script_type
    )
    select coalesce(
      avg(round((meaning_score + recognition_score + pronunciation_score)::numeric / 3)),
      0
    ) into v_story_pct
    from story_word_scores;
  end if;

  with playable as (
    select activity.*
    from public.lesson_practice_activities activity
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'vocabulary'
    order by activity.position, activity.id
    limit 7
  )
  select
    count(*)::integer,
    count(answer.id)::integer,
    count(*) filter (
      where answer.id is not null
        and public.canonical_lesson_answer_matches(
          answer.selected_answer,
          activity.correct_answer,
          activity.accepted_answers
        )
    )::integer
  into v_vocab_total, v_vocab_answered, v_vocab_correct
  from playable activity
  left join public.lesson_activity_answers answer
    on answer.user_id = v_session.user_id
   and answer.lesson_session_id = v_session.id
   and answer.phase = 'vocabulary'
   and answer.activity_id = activity.id::text;

  if v_vocab_total <> 7 or v_vocab_answered <> 7 then
    raise exception 'Vocabulary practice requires exactly 7 playable answers' using errcode = '55000';
  end if;
  v_vocab_pct := 100::numeric * v_vocab_correct / 7;

  with playable as (
    select activity.*
    from public.lesson_practice_activities activity
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'grammar'
    order by activity.position, activity.id
    limit 7
  )
  select
    count(*)::integer,
    count(answer.id)::integer,
    count(*) filter (
      where answer.id is not null
        and public.canonical_lesson_answer_matches(
          answer.selected_answer,
          activity.correct_answer,
          activity.accepted_answers
        )
    )::integer
  into
    v_grammar_static_total,
    v_grammar_static_answered,
    v_grammar_static_correct
  from playable activity
  left join public.lesson_activity_answers answer
    on answer.user_id = v_session.user_id
   and answer.lesson_session_id = v_session.id
   and answer.phase = 'grammar'
   and answer.activity_id = activity.id::text;

  if v_grammar_static_total <> 7 or v_grammar_static_answered <> 7 then
    raise exception 'Grammar practice requires exactly 7 playable answers' using errcode = '55000';
  end if;

  if v_premium then
    select
      count(*)::integer,
      count(answer.id) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
      )::integer,
      count(*) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
          and answer.correct is true
      )::integer
    into v_translation_total, v_translation_validated, v_translation_correct
    from public.lesson_translation_questions question
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar_translation'
     and answer.activity_id = question.id::text
    where question.user_id = v_session.user_id
      and question.lesson_session_id = v_session.id
      and question.lesson_id = v_session.lesson_id
      and question.lesson_version_id = v_session.lesson_version_id;

    if v_translation_total <> 5 or v_translation_validated <> 5 then
      raise exception 'Premium Grammar requires exactly 5 validated translations' using errcode = '55000';
    end if;

    v_grammar_pct :=
      100::numeric
      * (v_grammar_static_correct + v_translation_correct)
      / 12;
  else
    -- Free Translation evidence, including rows from a prior Premium state, is
    -- not required and cannot help or hurt the Free score.
    v_grammar_pct := 100::numeric * v_grammar_static_correct / 7;
  end if;

  with playable as (
    select question.*
    from public.lesson_reading_questions question
    where question.lesson_version_id = v_session.lesson_version_id
    order by question.position, question.id
    limit 5
  )
  select
    count(*)::integer,
    count(answer.response)::integer,
    count(*) filter (
      where answer.response is not null
        and btrim(normalize(answer.response, NFKC))
          = btrim(normalize(question.answer, NFKC))
    )::integer
  into v_reading_total, v_reading_answered, v_reading_correct
  from playable question
  left join lateral (
    select item ->> 'response' as response
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_checkpoint -> 'readingAnswers') = 'array'
          then v_checkpoint -> 'readingAnswers'
        else '[]'::jsonb
      end
    ) item
    where item ->> 'questionId' = question.id::text
    limit 1
  ) answer on true;

  if v_reading_total <> 5 or v_reading_answered <> 5 then
    raise exception 'Reading practice requires exactly 5 playable answers' using errcode = '55000';
  end if;
  v_reading_pct := 100::numeric * v_reading_correct / 5;

  if v_premium then
    with playable as (
      select activity.*
      from public.lesson_listening_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
      order by activity.position, activity.id
      limit 5
    )
    select
      count(*)::integer,
      count(answer.selected_answer)::integer,
      count(*) filter (
        where answer.selected_answer is not null
          and btrim(normalize(answer.selected_answer, NFKC))
            = btrim(normalize(activity.correct_answer, NFKC))
      )::integer
    into v_listening_total, v_listening_answered, v_listening_correct
    from playable activity
    left join lateral (
      select event.event_data ->> 'selectedAnswer' as selected_answer
      from public.lesson_events event
      where event.user_id = v_session.user_id
        and event.lesson_session_id = v_session.id
        and event.phase = 'listening'
        and event.event_type = 'answer'
        and event.event_data ->> 'questionId' = activity.id::text
      order by event.occurred_at desc, event.created_at desc
      limit 1
    ) answer on true;

    if v_listening_total <> 5 or v_listening_answered <> 5 then
      raise exception 'Listening practice requires exactly 5 playable answers' using errcode = '55000';
    end if;
    v_listening_pct := 100::numeric * v_listening_correct / 5;

    with playable as (
      select activity.*
      from public.lesson_speaking_activities activity
      where activity.lesson_version_id = v_session.lesson_version_id
      order by activity.position, activity.id
      limit 5
    )
    select
      count(*)::integer,
      count(answer.id) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
          and coalesce(answer.answer_data ->> 'score','') ~ '^[0-9]+(\.[0-9]+)?$'
      )::integer,
      coalesce(
        avg(greatest(0, least(100, (answer.answer_data ->> 'score')::numeric))) filter (
          where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
            and coalesce(answer.answer_data ->> 'score','') ~ '^[0-9]+(\.[0-9]+)?$'
        ),
        0
      )
    into v_speaking_total, v_speaking_validated, v_speaking_pct
    from playable activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'speaking'
     and answer.activity_id = activity.id::text;

    if v_speaking_total <> 5 or v_speaking_validated <> 5 then
      raise exception 'Speaking practice requires exactly 5 validated answers' using errcode = '55000';
    end if;
  end if;

  if v_premium then
    v_score := greatest(0, least(100, round((
      v_story_pct * 15
      + v_vocab_pct * 25
      + v_grammar_pct * 25
      + v_reading_pct * 15
      + v_listening_pct * 10
      + v_speaking_pct * 10
    ) / 100)::integer));
  else
    v_score := greatest(0, least(100, round((
      v_story_pct * 15
      + v_vocab_pct * 25
      + v_grammar_pct * 25
      + v_reading_pct * 15
    ) / 80)::integer));
  end if;

  v_xp := public.calculate_lesson_xp(v_score);

  v_duration := greatest(
    1,
    least(
      120,
      greatest(1, coalesce(v_lesson.duration_minutes, 30) * 2),
      greatest(
        0,
        floor(extract(epoch from (now() - v_session.started_at)) / 60)::integer
      )
    )
  );

  v_timezone := public.lesson_quota_timezone(v_session.user_id, v_profile.timezone);
  v_today := (now() at time zone v_timezone)::date;

  select max(activity_date) into v_last_activity_date
  from public.weekly_activity
  where user_id = v_session.user_id;

  v_current_streak := greatest(0, coalesce(v_profile.streak_days, 0));
  v_new_streak := case
    when v_last_activity_date = v_today then greatest(v_current_streak, 1)
    when v_last_activity_date = v_today - 1 then v_current_streak + 1
    else 1
  end;

  v_phase_scores := jsonb_build_object(
    'story', round(v_story_pct),
    'vocabulary', round(v_vocab_pct),
    'grammar', round(v_grammar_pct),
    'reading', round(v_reading_pct),
    'listening', case when v_premium then round(v_listening_pct) else null end,
    'speaking', case when v_premium then round(v_speaking_pct) else null end
  );

  v_completion_data := p_completion_data || jsonb_build_object(
    'canonicalScore', v_score,
    'canonicalXp', v_xp,
    'canonicalDurationMinutes', v_duration,
    'scoreEngineVersion', 'lesson-v3-product-contract',
    'phaseScores', v_phase_scores,
    'premiumPhasesIncluded', v_premium,
    'activityDate', v_today,
    'activityTimezone', v_timezone,
    'playableCounts', jsonb_build_object(
      'vocabulary', 7,
      'grammar', 7,
      'translation', case when v_premium then 5 else 0 end,
      'reading', 5,
      'listening', case when v_premium then 5 else 0 end,
      'speaking', case when v_premium then 5 else 0 end
    )
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'lesson_id', v_session.lesson_id,
    'lesson_version_id', v_session.lesson_version_id,
    'score', v_score,
    'xp_awarded', v_xp,
    'duration_minutes', v_duration,
    'phase_scores', v_phase_scores,
    'premium_phases_included', v_premium,
    'streak_days', v_new_streak,
    'activity_date', v_today,
    'rewarded', true,
    'canonical', true
  );

  insert into public.lesson_completions (
    user_id, lesson_id, lesson_version_id, lesson_session_id,
    score, xp_awarded, duration_minutes, completion_data
  ) values (
    v_session.user_id, v_session.lesson_id, v_session.lesson_version_id,
    p_session_id, v_score, v_xp, v_duration, v_completion_data
  )
  on conflict (lesson_session_id) do nothing;

  insert into public.reward_ledger (
    user_id, reward_type, source_id, xp_awarded, canonical_result
  ) values (
    v_session.user_id, 'lesson', p_session_id, v_xp, v_result
  )
  on conflict (reward_type, source_id) do nothing
  returning * into v_ledger;

  if not found then
    select * into v_ledger
    from public.reward_ledger
    where reward_type = 'lesson'
      and source_id = p_session_id;
    return v_ledger.canonical_result;
  end if;

  update public.lesson_sessions
  set status = 'completed',
      completed_at = now(),
      reward_claimed_at = now(),
      updated_at = now()
  where id = p_session_id;

  update public.lesson_assignments
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where user_id = v_session.user_id
    and lesson_id = v_session.lesson_id
    and lesson_version_id = v_session.lesson_version_id
    and selection_mode = 'custom_topic'
    and status in ('assigned','started');

  update public.profiles
  set xp = xp + v_xp,
      streak_days = v_new_streak,
      longest_streak = greatest(longest_streak, v_new_streak),
      total_study_minutes = total_study_minutes + v_duration
  where id = v_session.user_id;

  insert into public.weekly_activity (
    user_id, activity_date, minutes, lesson_minutes
  ) values (
    v_session.user_id, v_today, v_duration, v_duration
  )
  on conflict (user_id, activity_date) do update
  set minutes = public.weekly_activity.minutes + excluded.minutes,
      lesson_minutes = public.weekly_activity.lesson_minutes + excluded.lesson_minutes;

  return v_result;
end;
$$;

revoke all on function public.complete_lesson_session(
  uuid, integer, integer, integer, jsonb
) from public, anon;
grant execute on function public.complete_lesson_session(
  uuid, integer, integer, integer, jsonb
) to authenticated;

comment on function public.complete_lesson_session(
  uuid, integer, integer, integer, jsonb
) is
  'Completes a lesson idempotently using exactly the playable product contract. Client score, XP, duration, and correctness remain non-authoritative.';

-- Fail fast if the protected Translation table is accidentally opened directly.
do $$
begin
  if has_table_privilege('authenticated','public.lesson_translation_questions','SELECT')
     or has_table_privilege('authenticated','public.lesson_translation_questions','INSERT')
     or has_table_privilege('authenticated','public.lesson_translation_questions','UPDATE')
     or has_table_privilege('authenticated','public.lesson_translation_questions','DELETE') then
    raise exception 'Authenticated direct Translation table access is not allowed';
  end if;
end;
$$;
