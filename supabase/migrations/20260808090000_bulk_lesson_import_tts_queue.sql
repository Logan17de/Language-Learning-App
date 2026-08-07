-- Bulk complete-lesson import plus durable application-level TTS batching.
--
-- Imported lessons already use public.import_complete_lesson(), which writes the
-- normalized lesson tables consumed by the learner app. This migration adds:
--   * an atomic wrapper for importing 1-100 complete lesson packages;
--   * a durable queue for imported lesson-version listening audio;
--   * automatic 100-lesson threshold batches;
--   * manual 1-100 lesson batch creation.
--
-- Audio synthesis itself remains server-side. The queue stores no provider
-- credentials and grants no browser table access.

create table if not exists public.lesson_tts_batches (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'partial', 'failed')),
  trigger_source text not null
    check (trigger_source in ('manual', 'threshold')),
  lesson_count integer not null default 0 check (lesson_count >= 0 and lesson_count <= 100),
  processed_count integer not null default 0 check (processed_count >= 0),
  ready_count integer not null default 0 check (ready_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  generated_audio_count integer not null default 0 check (generated_audio_count >= 0),
  reused_audio_count integer not null default 0 check (reused_audio_count >= 0),
  linked_audio_count integer not null default 0 check (linked_audio_count >= 0),
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_tts_queue (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  lesson_version_id uuid not null unique references public.lesson_versions(id) on delete cascade,
  batch_id uuid references public.lesson_tts_batches(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'batched', 'processing', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  generated_audio_count integer not null default 0 check (generated_audio_count >= 0),
  reused_audio_count integer not null default 0 check (reused_audio_count >= 0),
  linked_audio_count integer not null default 0 check (linked_audio_count >= 0),
  error_message text,
  queued_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_tts_queue_pending_idx
  on public.lesson_tts_queue (status, queued_at);
create index if not exists lesson_tts_queue_batch_idx
  on public.lesson_tts_queue (batch_id, status);
create index if not exists lesson_tts_batches_status_idx
  on public.lesson_tts_batches (status, created_at);

alter table public.lesson_tts_batches enable row level security;
alter table public.lesson_tts_queue enable row level security;

revoke all on table public.lesson_tts_batches from public, anon, authenticated;
revoke all on table public.lesson_tts_queue from public, anon, authenticated;
grant all on table public.lesson_tts_batches to service_role;
grant all on table public.lesson_tts_queue to service_role;

-- Create a batch from the oldest pending imported lesson versions. Threshold
-- calls require 100 candidates. Manual calls intentionally allow fewer.
create or replace function public.create_lesson_tts_batch(
  p_limit integer default 100,
  p_trigger_source text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 100));
  v_ids uuid[] := '{}'::uuid[];
  v_count integer := 0;
  v_batch_id uuid;
begin
  if p_trigger_source not in ('manual', 'threshold') then
    raise exception 'Invalid TTS batch source' using errcode = '22023';
  end if;

  -- Direct/manual execution is owner-admin or service-role only. The threshold
  -- trigger also runs under the importer's authenticated admin identity.
  if coalesce(auth.role(), '') <> 'service_role'
     and public.current_app_role() <> 'admin'::public.app_role then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  select coalesce(array_agg(candidate.id order by candidate.queued_at), '{}'::uuid[])
    into v_ids
  from (
    select queue.id, queue.queued_at
    from public.lesson_tts_queue queue
    where queue.status = 'pending'
      and queue.batch_id is null
    order by queue.queued_at, queue.id
    for update skip locked
    limit v_limit
  ) candidate;

  v_count := cardinality(v_ids);
  if v_count = 0 then
    return null;
  end if;
  if p_trigger_source = 'threshold' and v_count < 100 then
    return null;
  end if;

  insert into public.lesson_tts_batches (
    trigger_source,
    lesson_count,
    requested_by
  ) values (
    p_trigger_source,
    v_count,
    auth.uid()
  )
  returning id into v_batch_id;

  update public.lesson_tts_queue
  set batch_id = v_batch_id,
      status = 'batched',
      updated_at = now()
  where id = any(v_ids);

  return v_batch_id;
end;
$$;

revoke all on function public.create_lesson_tts_batch(integer, text) from public, anon;
grant execute on function public.create_lesson_tts_batch(integer, text) to authenticated, service_role;

-- Every new admin-created lesson version gets an audio queue row. On the 100th
-- pending version, the oldest 100 are atomically moved into a threshold batch.
create or replace function public.enqueue_imported_lesson_tts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source text;
begin
  select lesson.source
    into v_source
  from public.lessons lesson
  where lesson.id = new.lesson_id;

  if v_source is distinct from 'admin_created' then
    return new;
  end if;

  insert into public.lesson_tts_queue (
    lesson_id,
    lesson_version_id,
    status
  ) values (
    new.lesson_id,
    new.id,
    'pending'
  )
  on conflict (lesson_version_id) do nothing;

  perform public.create_lesson_tts_batch(100, 'threshold');
  return new;
end;
$$;

revoke all on function public.enqueue_imported_lesson_tts() from public, anon, authenticated;

drop trigger if exists enqueue_imported_lesson_tts_after_version on public.lesson_versions;
create trigger enqueue_imported_lesson_tts_after_version
after insert on public.lesson_versions
for each row execute function public.enqueue_imported_lesson_tts();

-- Import 1-100 existing schemaVersion=1 lesson packages as one transaction.
-- Any failure rolls the complete upload back instead of leaving a half-imported
-- 100-lesson file in the canonical library.
create or replace function public.import_complete_lessons(
  p_packages jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_count integer;
begin
  if public.current_app_role() <> 'admin'::public.app_role then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if jsonb_typeof(p_packages) <> 'array' then
    raise exception 'Bulk lesson import requires a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_packages);
  if v_count < 1 or v_count > 100 then
    raise exception 'Bulk lesson import accepts 1-100 lessons' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_packages)
  loop
    v_result := public.import_complete_lesson(v_item, p_publish);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'count', v_count,
    'results', v_results
  );
end;
$$;

revoke all on function public.import_complete_lessons(jsonb, boolean) from public, anon;
grant execute on function public.import_complete_lessons(jsonb, boolean) to authenticated;

comment on table public.lesson_tts_queue is
  'Durable listening-TTS work queue for externally/admin imported lesson versions.';
comment on table public.lesson_tts_batches is
  'Groups up to 100 imported lesson versions for manual or threshold-triggered listening TTS preparation.';
