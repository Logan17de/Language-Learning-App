-- Durable staging for offline OpenAI Batch lesson generation.
-- Raw provider output is preserved before parsing or validation so invalid,
-- malformed, refused, and failed lessons can all be inspected and repaired.

create table if not exists public.lesson_generation_batches (
  id uuid primary key default gen_random_uuid(),
  jlpt_level public.jlpt_level not null default 'N5'::public.jlpt_level,
  requested_count integer not null check (requested_count between 1 and 100),
  model text not null,
  status text not null default 'planning'
    check (status in (
      'planning', 'submitting', 'validating', 'in_progress', 'finalizing',
      'completed', 'partial', 'failed', 'expired', 'cancelling', 'cancelled'
    )),
  provider_batch_id text unique,
  provider_input_file_id text,
  provider_output_file_id text,
  provider_error_file_id text,
  provider_batch_object jsonb,
  provider_request_counts jsonb not null default '{}'::jsonb,
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  last_synced_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_generation_requests (
  id uuid primary key default gen_random_uuid(),
  generation_batch_id uuid not null references public.lesson_generation_batches(id) on delete cascade,
  custom_id text not null unique,
  sequence_number integer not null check (sequence_number between 1 and 100),
  jlpt_level public.jlpt_level not null default 'N5'::public.jlpt_level,
  target_kanji text[] not null check (cardinality(target_kanji) = 5),
  target_grammar text[] not null check (cardinality(target_grammar) = 3),
  status text not null default 'planned'
    check (status in ('planned', 'submitted', 'api_completed', 'api_failed', 'invalid', 'valid', 'imported')),
  raw_provider_line jsonb,
  raw_response text,
  provider_error jsonb,
  parsed_lesson jsonb,
  edited_lesson jsonb,
  validation_errors text[] not null default '{}',
  provider_request_id text,
  model text not null,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  imported_lesson_id uuid references public.lessons(id) on delete set null,
  imported_lesson_version_id uuid references public.lesson_versions(id) on delete set null,
  last_validated_at timestamptz,
  manually_fixed_at timestamptz,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (generation_batch_id, sequence_number)
);

create index if not exists lesson_generation_batches_status_idx
  on public.lesson_generation_batches (status, created_at desc);
create index if not exists lesson_generation_requests_batch_idx
  on public.lesson_generation_requests (generation_batch_id, sequence_number);
create index if not exists lesson_generation_requests_status_idx
  on public.lesson_generation_requests (status, updated_at desc);
create index if not exists lesson_generation_requests_level_idx
  on public.lesson_generation_requests (jlpt_level, created_at desc);

alter table public.lesson_generation_batches enable row level security;
alter table public.lesson_generation_requests enable row level security;

-- These staging records can contain raw model output and provider metadata.
-- Keep them off the browser Supabase client; owner-admin APIs use service_role.
revoke all on table public.lesson_generation_batches from public, anon, authenticated;
revoke all on table public.lesson_generation_requests from public, anon, authenticated;
grant all on table public.lesson_generation_batches to service_role;
grant all on table public.lesson_generation_requests to service_role;

comment on table public.lesson_generation_batches is
  'Owner-only staging metadata for asynchronous complete-lesson OpenAI Batch jobs.';
comment on table public.lesson_generation_requests is
  'Per-lesson staged Batch request and immutable raw provider output. Validation never deletes failed output.';
comment on column public.lesson_generation_requests.raw_provider_line is
  'Complete JSONL line returned by the Batch output/error file before application parsing.';
comment on column public.lesson_generation_requests.raw_response is
  'Raw model text preserved even when JSON parsing or lesson validation fails.';
comment on column public.lesson_generation_requests.edited_lesson is
  'Owner manual repair. The original raw_response and parsed_lesson remain unchanged.';
