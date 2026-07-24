create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('learner', 'admin', 'content_editor', 'support');
create type public.account_status as enum ('active', 'suspended', 'deleted');
create type public.jlpt_level as enum ('N5', 'N4', 'N3', 'N2', 'N1');
create type public.lesson_status as enum ('draft', 'generated', 'checking', 'needs_review', 'approved', 'published', 'rejected', 'archived');
create type public.session_status as enum ('active', 'completed', 'abandoned');
create type public.subscription_plan as enum ('free', 'premium_monthly', 'premium_annual');
create type public.subscription_status as enum ('active', 'trial', 'cancelled', 'past_due');
create type public.custom_request_status as enum ('requested', 'matching', 'matched', 'generation_pending', 'generated', 'validation_pending', 'approved', 'failed');

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Learner' check (char_length(display_name) between 1 and 80),
  email text not null,
  current_jlpt_level public.jlpt_level not null default 'N5',
  learning_goal text,
  daily_study_minutes integer not null default 30 check (daily_study_minutes in (15, 30, 45, 60)),
  interests text[] not null default '{}',
  subscription_plan public.subscription_plan not null default 'free',
  role public.app_role not null default 'learner',
  status public.account_status not null default 'active',
  timezone text not null default 'UTC',
  xp integer not null default 0 check (xp >= 0),
  streak_days integer not null default 0 check (streak_days >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  total_study_minutes integer not null default 0 check (total_study_minutes >= 0),
  legacy_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  learning_goal text,
  daily_study_minutes integer not null default 30 check (daily_study_minutes in (15, 30, 45, 60)),
  interests text[] not null default '{}',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan public.subscription_plan not null default 'free',
  status public.subscription_status not null default 'active',
  billing_interval text check (billing_interval is null or billing_interval in ('monthly', 'annual')),
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  cancelled_at timestamptz,
  mock_payment_status text not null default 'not_applicable' check (mock_payment_status in ('paid', 'trial', 'failed', 'not_applicable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index user_subscriptions_one_current on public.user_subscriptions(user_id);

create table public.curriculum_levels (
  id uuid primary key default gen_random_uuid(),
  jlpt_level public.jlpt_level not null unique,
  title text not null,
  description text not null default '',
  sequence_order integer not null unique check (sequence_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.curriculum_items (
  id uuid primary key default gen_random_uuid(),
  curriculum_level_id uuid not null references public.curriculum_levels(id) on delete cascade,
  item_type text not null check (item_type in ('grammar', 'kanji', 'vocabulary')),
  label text not null,
  sequence_order integer not null check (sequence_order > 0),
  required boolean not null default true,
  prerequisite_ids uuid[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (curriculum_level_id, item_type, sequence_order)
);

create table public.grammar_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  pattern text not null,
  jlpt_level public.jlpt_level not null,
  meaning text not null,
  formation text not null,
  usage_notes text not null default '',
  nuance text not null default '',
  example_sentences text[] not null default '{}',
  common_mistakes text[] not null default '{}',
  prerequisite_ids uuid[] not null default '{}',
  similar_grammar_ids uuid[] not null default '{}',
  contrast_grammar_ids uuid[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pattern, jlpt_level)
);

create table public.kanji_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  character text not null unique check (char_length(character) between 1 and 4),
  jlpt_level public.jlpt_level not null,
  meanings text[] not null,
  readings text[] not null,
  onyomi text[] not null default '{}',
  kunyomi text[] not null default '{}',
  example_words text[] not null default '{}',
  stroke_count integer not null check (stroke_count between 1 and 64),
  prerequisite_kanji text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vocabulary_records (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  written_form text not null,
  reading text not null,
  meaning text not null,
  part_of_speech text not null,
  jlpt_level public.jlpt_level not null,
  tags text[] not null default '{}',
  example_sentence text not null default '',
  linked_kanji_ids uuid[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (written_form, reading, meaning)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  slug text not null unique,
  title text not null,
  japanese_title text not null,
  summary text not null,
  topic text not null,
  jlpt_level public.jlpt_level not null,
  duration_minutes integer not null check (duration_minutes between 5 and 120),
  status public.lesson_status not null default 'draft',
  source text not null check (source in ('curated_seed', 'generated', 'user_generated', 'admin_created', 'community')),
  source_lesson_id uuid references public.lessons(id) on delete set null,
  current_version_id uuid,
  tags text[] not null default '{}',
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status public.lesson_status not null default 'draft',
  change_summary text not null default '',
  schema_version integer not null default 1 check (schema_version > 0),
  answer_keys text[] not null default '{}',
  review_items text[] not null default '{}',
  phases jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array'),
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, version_number)
);

alter table public.lessons
  add constraint lessons_current_version_fk foreign key (current_version_id) references public.lesson_versions(id) on delete set null;

create table public.image_assets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  storage_path text not null,
  description text not null default '',
  topic_tags text[] not null default '{}',
  visible_objects text[] not null default '{}',
  vocabulary_tags text[] not null default '{}',
  grammar_compatibility text[] not null default '{}',
  jlpt_level public.jlpt_level not null,
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  creation_source text not null check (creation_source in ('curated', 'generated', 'placeholder')),
  status text not null default 'active' check (status in ('active', 'review', 'reported', 'archived', 'low_quality', 'inappropriate')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audio_assets (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  storage_path text not null,
  japanese_text text not null,
  voice text not null,
  speaking_style text not null check (speaking_style in ('neutral', 'friendly', 'formal')),
  duration_seconds numeric(8,2) not null default 0 check (duration_seconds >= 0),
  playback_speed numeric(4,2) not null default 1 check (playback_speed between 0.5 and 2),
  status text not null default 'active' check (status in ('active', 'review', 'reported', 'archived', 'low_quality')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_story_lines (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  japanese_text text not null,
  translation text not null,
  tappable_terms text[] not null default '{}',
  image_asset_id uuid references public.image_assets(id) on delete set null,
  audio_asset_id uuid references public.audio_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_vocabulary (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  vocabulary_id uuid references public.vocabulary_records(id) on delete set null,
  written_form text not null,
  reading text not null,
  meaning text not null,
  part_of_speech text not null,
  example_sentence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_grammar (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  grammar_id uuid references public.grammar_records(id) on delete set null,
  pattern text not null,
  meaning text not null,
  structure text not null,
  usage_notes text not null,
  example text not null,
  translation text not null,
  common_mistake text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_reading_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  speaker text not null,
  japanese_text text not null,
  translation text not null,
  tappable_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_listening_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  prompt text not null,
  transcript text not null,
  choices text[] not null check (cardinality(choices) >= 2),
  correct_answer text not null,
  explanation text not null,
  audio_asset_id uuid references public.audio_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position),
  check (correct_answer = any(choices))
);

create table public.lesson_speaking_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  mode text not null check (mode in ('easy', 'medium', 'hard')),
  prompt text not null,
  easy_prompt text,
  medium_prompt text,
  hard_prompt text,
  expected_answer text,
  model_answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_review_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  question_type text not null check (question_type in ('multiple-choice', 'ordering', 'fill-blank', 'true-false')),
  category text not null,
  prompt text not null,
  choices text[] not null,
  correct_answer text not null,
  explanation text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create table public.lesson_assets (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  asset_type text not null check (asset_type in ('image', 'audio')),
  image_asset_id uuid references public.image_assets(id) on delete cascade,
  audio_asset_id uuid references public.audio_assets(id) on delete cascade,
  position integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((asset_type = 'image' and image_asset_id is not null and audio_asset_id is null)
    or (asset_type = 'audio' and audio_asset_id is not null and image_asset_id is null))
);

create table public.lesson_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  lesson_version_id uuid not null references public.lesson_versions(id) on delete restrict,
  status public.session_status not null default 'active',
  current_phase text not null default 'story',
  current_phase_index integer not null default 0 check (current_phase_index between 0 and 6),
  activity_index integer not null default 0 check (activity_index >= 0),
  elapsed_seconds integer not null default 0 check (elapsed_seconds >= 0),
  checkpoint jsonb not null default '{}'::jsonb check (jsonb_typeof(checkpoint) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_saved_at timestamptz not null default now(),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_lesson_session_per_version on public.lesson_sessions(user_id, lesson_version_id) where status = 'active';

create table public.lesson_activity_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_session_id uuid not null references public.lesson_sessions(id) on delete cascade,
  phase text not null,
  activity_id text not null,
  selected_answer text not null,
  correct boolean not null,
  attempts integer not null default 1 check (attempts > 0),
  answer_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_session_id, phase, activity_id)
);

create table public.lesson_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_session_id uuid not null references public.lesson_sessions(id) on delete cascade,
  client_event_id text not null,
  phase text not null check (phase in ('story', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'review')),
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_session_id, client_event_id)
);

create table public.lesson_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  lesson_version_id uuid not null references public.lesson_versions(id) on delete restrict,
  lesson_session_id uuid not null unique references public.lesson_sessions(id) on delete restrict,
  score integer not null check (score between 0 and 100),
  xp_awarded integer not null check (xp_awarded between 0 and 500),
  duration_minutes integer not null check (duration_minutes between 0 and 1440),
  completion_data jsonb not null default '{}'::jsonb,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learner_mastery (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('kanji', 'vocabulary', 'grammar', 'listening', 'speaking')),
  item_key text not null,
  mastery integer not null default 0 check (mastery between 0 and 100),
  confidence integer not null default 0 check (confidence between 0 and 100),
  last_reviewed_at timestamptz,
  next_review_at timestamptz,
  evidence_count integer not null default 0 check (evidence_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_key)
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('kanji', 'vocabulary', 'grammar', 'listening', 'speaking')),
  item_key text not null,
  prompt_data jsonb not null default '{}'::jsonb,
  due_at timestamptz not null,
  confidence integer not null default 0 check (confidence between 0 and 100),
  reason text not null default '',
  status text not null default 'due' check (status in ('due', 'scheduled', 'mastered', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, item_type, item_key)
);

create table public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status public.session_status not null default 'active',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  score integer check (score between 0 and 100),
  xp_awarded integer not null default 0 check (xp_awarded between 0 and 500),
  reward_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_review_session_per_user on public.review_sessions(user_id) where status = 'active';

create table public.review_activity_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_session_id uuid not null references public.review_sessions(id) on delete cascade,
  review_queue_id uuid references public.review_queue(id) on delete set null,
  activity_id text not null,
  activity_type text not null,
  selected_answer text not null,
  correct boolean not null,
  answer_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_session_id, activity_id)
);

create table public.review_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_session_id uuid not null unique references public.review_sessions(id) on delete restrict,
  score integer not null check (score between 0 and 100),
  correct_count integer not null check (correct_count >= 0),
  total_count integer not null check (total_count > 0 and correct_count <= total_count),
  improved_item_ids text[] not null default '{}',
  weak_item_ids text[] not null default '{}',
  xp_awarded integer not null check (xp_awarded between 0 and 500),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  title text not null,
  description text not null,
  target integer not null check (target > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  earned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create table public.weekly_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  minutes integer not null default 0 check (minutes >= 0),
  lesson_minutes integer not null default 0 check (lesson_minutes >= 0),
  review_minutes integer not null default 0 check (review_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_date)
);

create table public.custom_lesson_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  topic text not null,
  jlpt_level public.jlpt_level not null,
  duration_minutes integer not null check (duration_minutes in (15, 30, 45, 60)),
  focus text not null,
  speaking_difficulty text not null check (speaking_difficulty in ('easy', 'medium', 'hard')),
  note text not null default '',
  status public.custom_request_status not null default 'requested',
  matched_lesson_id uuid references public.lessons(id) on delete set null,
  generated_lesson_id uuid references public.lessons(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generated_lesson_jobs (
  id uuid primary key default gen_random_uuid(),
  custom_lesson_request_id uuid not null references public.custom_lesson_requests(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  status text not null check (status in ('queued', 'matching', 'generating', 'checking', 'completed', 'failed')),
  source_lesson_id uuid references public.lessons(id) on delete set null,
  generation_seconds integer check (generation_seconds is null or generation_seconds >= 0),
  error_message text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_validation_runs (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  lesson_version_id uuid references public.lesson_versions(id) on delete cascade,
  status text not null check (status in ('checking', 'passed', 'warning', 'failed')),
  score integer not null check (score between 0 and 100),
  warnings text[] not null default '{}',
  validated_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lesson_validation_checks (
  id uuid primary key default gen_random_uuid(),
  validation_run_id uuid not null references public.lesson_validation_runs(id) on delete cascade,
  category text not null,
  check_key text not null,
  label text not null,
  severity text not null check (severity in ('passed', 'warning', 'failed')),
  detail text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (validation_run_id, check_key)
);

create table public.lesson_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  lesson_version_id uuid references public.lesson_versions(id) on delete set null,
  phase text,
  activity_id text,
  category text not null,
  description text not null check (char_length(description) between 8 and 4000),
  user_answer text,
  route text not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'new' check (status in ('new', 'investigating', 'confirmed', 'fixed', 'rejected', 'closed')),
  assigned_to uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('contact', 'technical', 'lesson', 'billing')),
  subject text not null,
  status text not null default 'new' check (status in ('new', 'open', 'waiting_for_user', 'resolved', 'closed')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  assigned_to uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  support_ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_role public.app_role not null,
  message text not null check (char_length(message) between 1 and 10000),
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_summary jsonb,
  after_summary jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  enabled boolean not null default false,
  public boolean not null default false,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_status (
  id uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  status text not null check (status in ('operational', 'degraded', 'offline')),
  detail text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cost_records (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  record_date date not null,
  amount numeric(12,4) not null check (amount >= 0),
  unit text not null,
  units numeric(14,4) not null default 0 check (units >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category, record_date)
);

create table public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null check (reward_type in ('lesson', 'review')),
  source_id uuid not null,
  xp_awarded integer not null check (xp_awarded between 0 and 500),
  canonical_result jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reward_type, source_id)
);

create index lessons_status_level_idx on public.lessons(status, jlpt_level);
create index lesson_sessions_user_status_idx on public.lesson_sessions(user_id, status);
create index review_queue_user_due_idx on public.review_queue(user_id, due_at) where status = 'due';
create index mastery_user_score_idx on public.learner_mastery(user_id, mastery);
create index reports_status_idx on public.lesson_reports(status, priority);
create index support_status_idx on public.support_tickets(status, priority);
create index audit_entity_idx on public.audit_logs(entity_type, entity_id, created_at desc);

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_preferences','user_settings','user_subscriptions','curriculum_levels','curriculum_items',
    'grammar_records','kanji_records','vocabulary_records','lessons','lesson_versions','image_assets',
    'audio_assets','lesson_story_lines','lesson_vocabulary','lesson_grammar','lesson_reading_sections',
    'lesson_listening_activities','lesson_speaking_activities','lesson_review_activities','lesson_assets',
    'lesson_sessions','lesson_activity_answers','lesson_events','learner_mastery','review_queue',
    'review_sessions','review_activity_answers','achievements','user_achievements','weekly_activity',
    'custom_lesson_requests','generated_lesson_jobs','lesson_validation_runs','lesson_validation_checks',
    'lesson_reports','support_tickets','support_messages','feature_flags','service_status','cost_records'
  ]
  loop
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, timezone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Learner'), '@', 1)),
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'UTC')
  )
  on conflict (id) do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
