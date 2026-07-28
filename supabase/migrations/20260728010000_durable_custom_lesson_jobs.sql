-- Durable, server-owned custom lesson jobs.
-- Story generation remains synchronous; activity groups and audio are resumable.

alter table public.progressive_lesson_drafts
  add column if not exists current_stage text not null default 'story_ready',
  add column if not exists progress_percent smallint not null default 20,
  add column if not exists completed_groups text[] not null default '{}',
  add column if not exists failed_groups text[] not null default '{}',
  add column if not exists group_attempts jsonb not null default '{}'::jsonb,
  add column if not exists vocabulary_kanji_group jsonb,
  add column if not exists grammar_reading_group jsonb,
  add column if not exists communication_group jsonb,
  add column if not exists review_group jsonb,
  add column if not exists claimed_at timestamptz,
  add column if not exists worker_token uuid;

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_status_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_status_check
  check (
    status in (
      'story_building',
      'story_ready',
      'library_resolved',
      'activities_queued',
      'activities_building',
      'activities_validating',
      'activities_ready',
      'activities_failed',
      'lesson_saving',
      'lesson_ready',
      'audio_queued',
      'audio_building',
      'completed',
      'failed'
    )
  );

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_audio_status_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_audio_status_check
  check (audio_status in ('pending', 'queued', 'building', 'ready', 'failed'));

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_progress_percent_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_progress_percent_check
  check (progress_percent between 0 and 100);

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_group_attempts_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_group_attempts_check
  check (jsonb_typeof(group_attempts) = 'object');

create index if not exists progressive_lesson_drafts_claim_idx
  on public.progressive_lesson_drafts(status, updated_at)
  where lesson_id is null;

create index if not exists progressive_lesson_audio_claim_idx
  on public.progressive_lesson_drafts(audio_status, updated_at)
  where lesson_version_id is not null;

-- Claim one activity job with a row lock. A worker that disappears can be
-- replaced after ten minutes without losing already persisted groups.
create or replace function public.claim_progressive_lesson_job(
  p_request_id uuid default null
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

  select candidate.*
  into v_job
  from public.progressive_lesson_drafts candidate
  where (p_request_id is null or candidate.request_id = p_request_id)
    and candidate.lesson_id is null
    and candidate.build_attempts < 3
    and (
      candidate.status in (
        'story_ready',
        'library_resolved',
        'activities_queued',
        'activities_failed'
      )
      or (
        candidate.status in (
          'activities_building',
          'activities_validating',
          'lesson_saving'
        )
        and coalesce(candidate.claimed_at, candidate.updated_at)
          < now() - interval '10 minutes'
      )
    )
  order by candidate.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.progressive_lesson_drafts
  set status = 'activities_building',
      current_stage = 'activity_groups',
      progress_percent = greatest(progress_percent, 25),
      build_attempts = build_attempts + 1,
      build_started_at = now(),
      claimed_at = now(),
      worker_token = gen_random_uuid(),
      failed_groups = '{}',
      last_error = null,
      updated_at = now()
  where request_id = v_job.request_id
  returning * into v_job;

  return to_jsonb(v_job);
end
$$;

-- Save one successful group independently. Concurrent group completions are
-- serialized by the row update, so no completed group or audit entry is lost.
create or replace function public.save_progressive_lesson_group(
  p_request_id uuid,
  p_worker_token uuid,
  p_group text,
  p_payload jsonb,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
  v_completed text[];
  v_progress integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_group not in (
    'vocabulary_and_kanji',
    'grammar_and_reading',
    'listening_and_speaking',
    'final_review'
  ) then
    raise exception 'Unknown activity group' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Activity group payload must be an object'
      using errcode = '22023';
  end if;

  select array_agg(distinct value order by value)
  into v_completed
  from unnest(
    coalesce(
      (
        select completed_groups
        from public.progressive_lesson_drafts
        where request_id = p_request_id
          and worker_token = p_worker_token
        for update
      ),
      '{}'
    ) || array[p_group]
  ) value;

  if v_completed is null then
    raise exception 'Generation job is no longer claimed'
      using errcode = '40001';
  end if;

  v_progress := least(75, 25 + cardinality(v_completed) * 12);

  update public.progressive_lesson_drafts
  set vocabulary_kanji_group = case
        when p_group = 'vocabulary_and_kanji' then p_payload
        else vocabulary_kanji_group
      end,
      grammar_reading_group = case
        when p_group = 'grammar_and_reading' then p_payload
        else grammar_reading_group
      end,
      communication_group = case
        when p_group = 'listening_and_speaking' then p_payload
        else communication_group
      end,
      review_group = case
        when p_group = 'final_review' then p_payload
        else review_group
      end,
      completed_groups = v_completed,
      failed_groups = array_remove(failed_groups, p_group),
      generation_audit = generation_audit || jsonb_build_array(p_audit),
      current_stage = p_group,
      progress_percent = greatest(progress_percent, v_progress),
      last_error = null,
      updated_at = now()
  where request_id = p_request_id
    and worker_token = p_worker_token
  returning * into v_job;

  if not found then
    raise exception 'Generation job is no longer claimed'
      using errcode = '40001';
  end if;

  return to_jsonb(v_job);
end
$$;

-- Claim audio separately so lesson readiness is never tied to synthesis.
create or replace function public.claim_progressive_lesson_audio_job(
  p_request_id uuid default null
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

  select candidate.*
  into v_job
  from public.progressive_lesson_drafts candidate
  where (p_request_id is null or candidate.request_id = p_request_id)
    and candidate.lesson_version_id is not null
    and candidate.status in ('lesson_ready', 'audio_queued', 'audio_building', 'completed')
    and candidate.audio_attempts < 3
    and (
      candidate.audio_status in ('pending', 'queued', 'failed')
      or (
        candidate.audio_status = 'building'
        and coalesce(candidate.audio_started_at, candidate.updated_at)
          < now() - interval '10 minutes'
      )
    )
  order by candidate.updated_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.progressive_lesson_drafts
  set status = 'audio_building',
      current_stage = 'audio',
      progress_percent = greatest(progress_percent, 92),
      audio_status = 'building',
      audio_attempts = audio_attempts + 1,
      audio_started_at = now(),
      audio_error = null,
      updated_at = now()
  where request_id = v_job.request_id
  returning * into v_job;

  return to_jsonb(v_job);
end
$$;

-- The existing storage RPC deliberately uses auth.uid(). This server-only
-- wrapper locks the request, makes repeated saves idempotent, and supplies the
-- request owner to that proven storage path without exposing impersonation to
-- browser roles.
create or replace function public.store_generated_lesson_package_background(
  p_request_id uuid,
  p_package jsonb,
  p_generation_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.custom_lesson_requests%rowtype;
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.custom_lesson_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Generation request unavailable' using errcode = '22023';
  end if;

  if v_request.generated_lesson_id is not null then
    select *
    into v_lesson
    from public.lessons
    where id = v_request.generated_lesson_id
      and current_version_id is not null;

    select *
    into v_assignment
    from public.lesson_assignments
    where user_id = v_request.user_id
      and lesson_id = v_request.generated_lesson_id
    order by assigned_at desc
    limit 1;

    if v_lesson.id is not null and v_assignment.id is not null then
      return jsonb_build_object(
        'lesson_id', v_lesson.id,
        'lesson_version_id', v_lesson.current_version_id,
        'assignment_id', v_assignment.id,
        'status', 'published',
        'reused', true
      );
    end if;
  end if;

  if v_request.status <> 'generation_pending' then
    raise exception 'Generation request unavailable' using errcode = '22023';
  end if;

  perform set_config('request.jwt.claim.sub', v_request.user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  return public.store_generated_lesson_package_v2(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
end
$$;

revoke all on function public.claim_progressive_lesson_job(uuid) from public;
revoke all on function public.save_progressive_lesson_group(uuid, uuid, text, jsonb, jsonb) from public;
revoke all on function public.claim_progressive_lesson_audio_job(uuid) from public;
revoke all on function public.store_generated_lesson_package_background(uuid, jsonb, integer) from public;

grant execute on function public.claim_progressive_lesson_job(uuid) to service_role;
grant execute on function public.save_progressive_lesson_group(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.claim_progressive_lesson_audio_job(uuid) to service_role;
grant execute on function public.store_generated_lesson_package_background(uuid, jsonb, integer) to service_role;

comment on function public.claim_progressive_lesson_job(uuid) is
  'Atomically claims one pending or stale custom lesson activity job.';
comment on function public.save_progressive_lesson_group(uuid, uuid, text, jsonb, jsonb) is
  'Persists one independently validated activity group without replacing successful peers.';
comment on function public.store_generated_lesson_package_background(uuid, jsonb, integer) is
  'Idempotent service-role bridge to the authenticated generated lesson storage RPC.';
