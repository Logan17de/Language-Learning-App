-- Make the complete custom-topic pipeline resumable. Each invocation claims one
-- persisted stage; stale claims can be recovered without discarding valid work.

alter table public.progressive_lesson_drafts
  alter column story_draft drop not null,
  alter column library_snapshot drop not null,
  add column if not exists lesson_plan jsonb,
  add column if not exists lesson_package jsonb,
  add column if not exists stage_attempts jsonb not null default '{}'::jsonb,
  add column if not exists resume_stage text,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists failure_classification text,
  add column if not exists provider_request_id text,
  add column if not exists last_duration_ms integer,
  add column if not exists last_action text;

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_status_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_status_check
  check (
    status in (
      'queued',
      'story_building',
      'vocabulary_enrichment',
      'library_resolution',
      'activity_groups',
      'final_validation',
      'lesson_saving',
      'audio',
      'completed',
      'retryable_failure',
      'permanent_failure',
      -- Keep deployed values valid during a rolling deployment.
      'story_ready',
      'library_resolved',
      'activities_queued',
      'activities_building',
      'activities_validating',
      'activities_ready',
      'activities_failed',
      'lesson_ready',
      'audio_queued',
      'audio_building',
      'failed'
    )
  );

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_stage_attempts_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_stage_attempts_check
  check (jsonb_typeof(stage_attempts) = 'object');

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_failure_classification_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_failure_classification_check
  check (
    failure_classification is null
    or failure_classification in (
      'transient', 'content', 'authorization', 'configuration', 'missing_catalog'
    )
  );

update public.progressive_lesson_drafts
set status = case
      when status in ('story_ready', 'library_resolved', 'activities_queued',
        'activities_building', 'activities_validating', 'activities_ready',
        'activities_failed') then 'activity_groups'
      when status = 'lesson_saving' and lesson_package is null then 'final_validation'
      when status in ('lesson_ready', 'audio_queued', 'audio_building') then 'audio'
      when status = 'failed' then 'permanent_failure'
      else status
    end,
    current_stage = case
      when status in ('story_ready', 'library_resolved', 'activities_queued',
        'activities_building', 'activities_validating', 'activities_ready',
        'activities_failed') then 'activity_groups'
      when status = 'lesson_saving' and lesson_package is null then 'final_validation'
      when status in ('lesson_ready', 'audio_queued', 'audio_building') then 'audio'
      when status = 'failed' then 'permanent_failure'
      else current_stage
    end,
    worker_token = null,
    claimed_at = null,
    next_attempt_at = now(),
    updated_at = now()
where status in (
  'story_ready', 'library_resolved', 'activities_queued', 'activities_building',
  'activities_validating', 'activities_ready', 'activities_failed', 'lesson_ready',
  'audio_queued', 'audio_building', 'failed', 'lesson_saving'
);

create index if not exists progressive_lesson_stage_claim_idx
  on public.progressive_lesson_drafts(status, next_attempt_at, created_at)
  where status not in ('completed', 'permanent_failure');

-- Start the durable row in the same transaction as the owned request and job.
create or replace function public.begin_custom_lesson_generation_v4(
  p_topic text,
  p_level public.jlpt_level
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_request public.custom_lesson_requests%rowtype;
begin
  v_result := public.begin_custom_lesson_generation_v3(p_topic, p_level);
  if coalesce((v_result->>'reused')::boolean, false) then
    return v_result;
  end if;

  select * into v_request
  from public.custom_lesson_requests
  where id = (v_result->>'request_id')::uuid
    and user_id = auth.uid();
  if not found then
    raise exception 'Generation request unavailable' using errcode = '42501';
  end if;

  insert into public.progressive_lesson_drafts (
    request_id, job_id, user_id, topic, jlpt_level, story_draft,
    library_snapshot, status, current_stage, progress_percent,
    next_attempt_at
  ) values (
    v_request.id,
    (v_result->>'job_id')::uuid,
    v_request.user_id,
    v_request.topic,
    v_request.jlpt_level,
    null,
    null,
    'queued',
    'queued',
    0,
    now()
  ) on conflict (request_id) do nothing;

  return v_result;
end
$$;

-- Atomic claim for exactly one stage. A dead worker's token becomes invalid
-- after eight minutes, and a replacement resumes the same persisted stage.
create or replace function public.claim_custom_lesson_stage(
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
  v_stage text;
  v_attempt integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select candidate.*
  into v_job
  from public.progressive_lesson_drafts candidate
  where (p_request_id is null or candidate.request_id = p_request_id)
    and candidate.status not in ('completed', 'permanent_failure')
    and (
      (
        candidate.worker_token is null
        and candidate.next_attempt_at <= now()
      )
      or (
        candidate.worker_token is not null
        and coalesce(candidate.claimed_at, candidate.updated_at)
          < now() - interval '8 minutes'
      )
    )
  order by candidate.next_attempt_at, candidate.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  v_stage := case
    when v_job.status = 'retryable_failure' then v_job.resume_stage
    else v_job.status
  end;
  if v_stage is null or v_stage not in (
    'queued', 'story_building', 'vocabulary_enrichment', 'library_resolution',
    'activity_groups', 'final_validation', 'lesson_saving', 'audio'
  ) then
    raise exception 'Generation job has no resumable stage' using errcode = '22023';
  end if;
  if v_stage = 'queued' then v_stage := 'story_building'; end if;

  v_attempt := case
    when v_stage = 'activity_groups' then 0
    else coalesce((v_job.stage_attempts->>v_stage)::integer, 0) + 1
  end;
  if v_stage <> 'activity_groups' and v_attempt > 3 then
    update public.progressive_lesson_drafts
    set status = 'permanent_failure', current_stage = 'permanent_failure',
        failure_classification = coalesce(failure_classification, 'transient'),
        worker_token = null, claimed_at = null, updated_at = now()
    where request_id = v_job.request_id;
    return null;
  end if;

  update public.progressive_lesson_drafts
  set status = v_stage,
      current_stage = v_stage,
      stage_attempts = case
        when v_stage = 'activity_groups' then stage_attempts
        else jsonb_set(stage_attempts, array[v_stage], to_jsonb(v_attempt), true)
      end,
      worker_token = gen_random_uuid(),
      claimed_at = now(),
      build_started_at = now(),
      last_error = null,
      failure_classification = null,
      provider_request_id = null,
      last_action = case
        when v_job.worker_token is not null then 'resumed_stale_claim'
        when v_job.status = 'retryable_failure' then 'resumed_retry'
        else 'claimed'
      end,
      updated_at = now()
  where request_id = v_job.request_id
  returning * into v_job;

  return to_jsonb(v_job);
end
$$;

create or replace function public.invalidate_progressive_lesson_group(
  p_request_id uuid,
  p_worker_token uuid,
  p_group text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_group not in (
    'vocabulary_and_kanji', 'grammar_and_reading',
    'listening_and_speaking', 'final_review'
  ) then
    raise exception 'Unknown activity group' using errcode = '22023';
  end if;

  update public.progressive_lesson_drafts
  set vocabulary_kanji_group = case when p_group = 'vocabulary_and_kanji' then null else vocabulary_kanji_group end,
      grammar_reading_group = case when p_group = 'grammar_and_reading' then null else grammar_reading_group end,
      communication_group = case when p_group = 'listening_and_speaking' then null else communication_group end,
      review_group = case when p_group = 'final_review' then null else review_group end,
      completed_groups = array_remove(completed_groups, p_group),
      failed_groups = array(select distinct value from unnest(failed_groups || array[p_group]) value order by value),
      lesson_package = null,
      last_error = left(coalesce(p_reason, 'Invalid activity checkpoint'), 1000),
      last_action = 'invalidated_checkpoint',
      updated_at = now()
  where request_id = p_request_id and worker_token = p_worker_token
  returning * into v_job;

  if not found then
    raise exception 'Generation job is no longer claimed' using errcode = '40001';
  end if;
  return to_jsonb(v_job);
end
$$;

-- Enrich only selected catalog placeholders. Permanent identifiers come from
-- the persisted plan; the model supplies descriptive fields only.
create or replace function public.enrich_custom_lesson_placeholders_background(
  p_request_id uuid,
  p_kanji jsonb,
  p_grammar jsonb,
  p_source_model text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
  v_item jsonb;
  v_character text;
  v_pattern text;
  v_level public.jlpt_level;
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_kanji) <> 'array' or jsonb_array_length(p_kanji) > 5
     or jsonb_typeof(p_grammar) <> 'array' or jsonb_array_length(p_grammar) > 3 then
    raise exception 'Invalid selected placeholder enrichment' using errcode = '22023';
  end if;

  select * into v_job from public.progressive_lesson_drafts
  where request_id = p_request_id for update;
  if not found or v_job.lesson_plan is null then
    raise exception 'Generation plan unavailable' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_kanji)
  loop
    v_character := trim(coalesce(v_item->>'character', ''));
    if v_character = ''
       or not exists (
         select 1 from jsonb_array_elements(v_job.lesson_plan->'kanji') planned
         where planned->>'character' = v_character
       )
       or jsonb_typeof(v_item->'meanings') <> 'array'
       or jsonb_array_length(v_item->'meanings') < 1
       or jsonb_typeof(v_item->'readings') <> 'array'
       or jsonb_array_length(v_item->'readings') < 1
       or jsonb_typeof(v_item->'exampleWords') <> 'array'
       or jsonb_array_length(v_item->'exampleWords') < 1 then
      raise exception 'Invalid selected kanji enrichment' using errcode = '22023';
    end if;

    update public.kanji_records
    set meanings = array(select btrim(value) from jsonb_array_elements_text(v_item->'meanings') value where btrim(value) <> ''),
        readings = array(select btrim(value) from jsonb_array_elements_text(v_item->'readings') value where btrim(value) <> ''),
        onyomi = coalesce(array(select btrim(value) from jsonb_array_elements_text(v_item->'onyomi') value where btrim(value) <> ''), '{}'),
        kunyomi = coalesce(array(select btrim(value) from jsonb_array_elements_text(v_item->'kunyomi') value where btrim(value) <> ''), '{}'),
        example_words = array(select btrim(value) from jsonb_array_elements_text(v_item->'exampleWords') value where btrim(value) <> ''),
        stroke_count = greatest(1, least(64, coalesce((v_item->>'strokeCount')::integer, 1))),
        source_type = 'ai_enriched', source_model = left(nullif(trim(p_source_model), ''), 120),
        quality_status = 'needs_review',
        source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('catalogOnly', false, 'enrichedForRequest', p_request_id),
        updated_at = now()
    where character = v_character and archived_at is null
      and (cardinality(meanings) = 0 or cardinality(readings) = 0 or cardinality(example_words) = 0);
    get diagnostics v_count = row_count;
  end loop;

  for v_item in select value from jsonb_array_elements(p_grammar)
  loop
    v_pattern := trim(coalesce(v_item->>'pattern', ''));
    select (planned->>'level')::public.jlpt_level
    into v_level
    from jsonb_array_elements(v_job.lesson_plan->'grammar') planned
    where planned->>'pattern' = v_pattern
    limit 1;
    if v_pattern = ''
       or v_level is null
       or btrim(coalesce(v_item->>'meaning', '')) = ''
       or btrim(coalesce(v_item->>'formation', '')) = ''
       or btrim(coalesce(v_item->>'usageNotes', '')) = ''
       or jsonb_typeof(v_item->'exampleSentences') <> 'array'
       or jsonb_array_length(v_item->'exampleSentences') < 1 then
      raise exception 'Invalid selected grammar enrichment' using errcode = '22023';
    end if;

    update public.grammar_records
    set meaning = btrim(v_item->>'meaning'), formation = btrim(v_item->>'formation'),
        usage_notes = btrim(v_item->>'usageNotes'), nuance = btrim(coalesce(v_item->>'nuance', '')),
        example_sentences = array(select btrim(value) from jsonb_array_elements_text(v_item->'exampleSentences') value where btrim(value) <> ''),
        source_type = 'ai_enriched', source_model = left(nullif(trim(p_source_model), ''), 120),
        quality_status = 'needs_review',
        source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object('catalogOnly', false, 'enrichedForRequest', p_request_id),
        updated_at = now()
    where pattern = v_pattern and jlpt_level = v_level and archived_at is null
      and (btrim(meaning) = '' or btrim(formation) = '' or btrim(usage_notes) = '' or cardinality(example_sentences) = 0);
    get diagnostics v_count = row_count;
  end loop;

  return jsonb_build_object('validated', true);
end
$$;

create or replace function public.record_story_kanji_exposures_background(
  p_request_id uuid,
  p_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.custom_lesson_requests%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into v_request from public.custom_lesson_requests where id = p_request_id;
  if not found then raise exception 'Generation request unavailable' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', v_request.user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return public.record_story_kanji_exposures(p_request_id, p_counts);
end
$$;

revoke all on function public.begin_custom_lesson_generation_v4(text, public.jlpt_level) from public;
revoke all on function public.claim_custom_lesson_stage(uuid) from public;
revoke all on function public.invalidate_progressive_lesson_group(uuid, uuid, text, text) from public;
revoke all on function public.enrich_custom_lesson_placeholders_background(uuid, jsonb, jsonb, text) from public;
revoke all on function public.record_story_kanji_exposures_background(uuid, jsonb) from public;

grant execute on function public.begin_custom_lesson_generation_v4(text, public.jlpt_level) to authenticated;
grant execute on function public.claim_custom_lesson_stage(uuid) to service_role;
grant execute on function public.invalidate_progressive_lesson_group(uuid, uuid, text, text) to service_role;
grant execute on function public.enrich_custom_lesson_placeholders_background(uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.record_story_kanji_exposures_background(uuid, jsonb) to service_role;

comment on function public.claim_custom_lesson_stage(uuid) is
  'Atomically claims one due custom lesson stage and recovers claims stale for eight minutes.';
comment on function public.enrich_custom_lesson_placeholders_background(uuid, jsonb, jsonb, text) is
  'Validates and enriches only catalog placeholders selected in a persisted custom lesson plan.';
