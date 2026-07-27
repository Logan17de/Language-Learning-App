-- One deterministic Google TTS file must map to one reusable audio record.
-- The generated storage path includes provider, voice, speed, language, and text.

create unique index if not exists audio_assets_active_storage_path_unique
  on public.audio_assets(storage_path)
  where archived_at is null;

comment on index public.audio_assets_active_storage_path_unique is
  'Prevents duplicate active audio metadata for the same deterministic TTS object.';
