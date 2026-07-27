-- Keep the first valid story durable while the remaining lesson packs build.
-- This table is server-only: browser clients never receive the stored library
-- snapshot or generation audit directly.

create table if not exists public.progressive_lesson_drafts (
  request_id uuid primary key
    references public.custom_lesson_requests(id) on delete cascade,
  job_id uuid
    references public.generated_lesson_jobs(id) on delete set null,
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  topic text not null,
  jlpt_level public.jlpt_level not null,
  story_draft jsonb not null,
  library_snapshot jsonb not null,
  generation_audit jsonb not null default '[]'::jsonb,
  status text not null default 'story_ready'
    check (
      status in (
        'story_ready',
        'activities_building',
        'activities_failed',
        'completed'
      )
    ),
  build_attempts integer not null default 0
    check (build_attempts between 0 and 5),
  build_started_at timestamptz,
  last_error text,
  lesson_id uuid references public.lessons(id) on delete set null,
  lesson_version_id uuid
    references public.lesson_versions(id) on delete set null,
  assignment_id uuid
    references public.lesson_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists progressive_lesson_drafts_user_status_idx
  on public.progressive_lesson_drafts(user_id, status, updated_at desc);

alter table public.progressive_lesson_drafts enable row level security;

revoke all on table public.progressive_lesson_drafts from anon, authenticated;
grant all on table public.progressive_lesson_drafts to service_role;

comment on table public.progressive_lesson_drafts is
  'Server-owned story checkpoints for resumable custom lesson generation.';
