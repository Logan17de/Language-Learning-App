-- Generate lesson audio after structured content is stored, link each reusable
-- asset to its source row, and keep audio failures separate from content builds.

alter table public.lesson_reading_sections
  add column if not exists audio_asset_id uuid
    references public.audio_assets(id) on delete set null;

alter table public.lesson_speaking_activities
  add column if not exists audio_asset_id uuid
    references public.audio_assets(id) on delete set null;

create index if not exists lesson_reading_sections_audio_asset_idx
  on public.lesson_reading_sections(audio_asset_id)
  where audio_asset_id is not null;

create index if not exists lesson_speaking_activities_audio_asset_idx
  on public.lesson_speaking_activities(audio_asset_id)
  where audio_asset_id is not null;

alter table public.progressive_lesson_drafts
  add column if not exists audio_status text not null default 'pending',
  add column if not exists audio_attempts integer not null default 0,
  add column if not exists audio_started_at timestamptz,
  add column if not exists audio_prepared_at timestamptz,
  add column if not exists audio_error text;

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_audio_status_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_audio_status_check
    check (audio_status in ('pending', 'building', 'ready', 'failed'));

alter table public.progressive_lesson_drafts
  drop constraint if exists progressive_lesson_drafts_audio_attempts_check;

alter table public.progressive_lesson_drafts
  add constraint progressive_lesson_drafts_audio_attempts_check
    check (audio_attempts between 0 and 5);

comment on column public.progressive_lesson_drafts.audio_status is
  'Independent post-generation TTS state. Audio failure never invalidates saved lesson content.';
