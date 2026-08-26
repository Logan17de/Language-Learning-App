-- Keep adaptive grammar translation prompts and answer keys server-owned.
-- Learner clients receive only an opaque question id and the English prompt.

create table public.lesson_translation_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_session_id uuid not null references public.lesson_sessions(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position between 1 and 5),
  english_prompt text not null check (length(trim(english_prompt)) > 0),
  target_item_id uuid not null references public.grammar_records(id) on delete restrict,
  target_pattern text not null check (length(trim(target_pattern)) > 0),
  target_meaning text not null check (length(trim(target_meaning)) > 0),
  target_role text not null check (target_role in ('lesson', 'reinforcement', 'lesson_fallback')),
  model_answer text not null check (length(trim(model_answer)) > 0),
  created_at timestamptz not null default now(),
  unique (lesson_session_id, position)
);

create index lesson_translation_questions_user_session_idx
  on public.lesson_translation_questions(user_id, lesson_session_id, position);

alter table public.lesson_translation_questions enable row level security;

-- Question targets and model answers are intentionally unavailable through the
-- browser Supabase client. Trusted application routes use the service role.
revoke all on table public.lesson_translation_questions from anon, authenticated;
grant all on table public.lesson_translation_questions to service_role;

comment on table public.lesson_translation_questions is
  'Server-owned runtime grammar translation set for one active lesson session.';
comment on column public.lesson_translation_questions.model_answer is
  'Hidden reference answer used for semantic validation; never return to learner clients.';
