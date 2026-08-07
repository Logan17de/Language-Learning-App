-- Imported lessons are immediately playable before their batch audio is ready,
-- because /api/audio/tts can synthesize on demand. Mark new admin-created
-- versions as stored/API audio so a linked batch asset is preferred whenever it
-- exists instead of forcing browser speech synthesis.

create or replace function public.set_imported_lesson_audio_mode()
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

  if v_source = 'admin_created' then
    new.metadata := jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      '{runtimeAudio}',
      '"stored_or_api"'::jsonb,
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function public.set_imported_lesson_audio_mode() from public, anon, authenticated;

drop trigger if exists set_imported_lesson_audio_mode_before_version on public.lesson_versions;
create trigger set_imported_lesson_audio_mode_before_version
before insert on public.lesson_versions
for each row execute function public.set_imported_lesson_audio_mode();

-- Existing admin-imported current versions become eligible for a manual TTS
-- flush after this migration. New versions are handled by the insert trigger in
-- 20260808090000_bulk_lesson_import_tts_queue.sql.
update public.lesson_versions version
set metadata = jsonb_set(
      coalesce(version.metadata, '{}'::jsonb),
      '{runtimeAudio}',
      '"stored_or_api"'::jsonb,
      true
    ),
    updated_at = now()
from public.lessons lesson
where lesson.id = version.lesson_id
  and lesson.source = 'admin_created'
  and version.status <> 'archived';

insert into public.lesson_tts_queue (
  lesson_id,
  lesson_version_id,
  status
)
select lesson.id, version.id, 'pending'
from public.lessons lesson
join public.lesson_versions version on version.lesson_id = lesson.id
where lesson.source = 'admin_created'
  and version.status <> 'archived'
  and not exists (
    select 1
    from public.lesson_tts_queue queue
    where queue.lesson_version_id = version.id
  )
on conflict (lesson_version_id) do nothing;
