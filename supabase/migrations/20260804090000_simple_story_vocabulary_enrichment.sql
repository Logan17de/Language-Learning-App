-- Store the exact raw vocabulary surfaces returned by the post-story
-- enrichment call. The model contract has only word, reading, and meaning;
-- no dictionary-form conversion or morphology metadata is requested.

create table if not exists public.story_vocabulary_enrichments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_lesson_requests(id)
    on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vocabulary_id uuid not null references public.vocabulary_records(id)
    on delete restrict,
  position integer not null check (position > 0),
  word text not null check (btrim(word) <> ''),
  reading text not null check (btrim(reading) <> ''),
  meaning text not null check (btrim(meaning) <> ''),
  source_model text,
  created_at timestamptz not null default now(),
  unique (request_id, word, reading, meaning)
);

create index if not exists story_vocabulary_enrichments_request_idx
  on public.story_vocabulary_enrichments (request_id, position);

create index if not exists story_vocabulary_enrichments_word_idx
  on public.story_vocabulary_enrichments (word, reading);

alter table public.story_vocabulary_enrichments enable row level security;

drop policy if exists story_vocabulary_enrichments_select_own
  on public.story_vocabulary_enrichments;
create policy story_vocabulary_enrichments_select_own
  on public.story_vocabulary_enrichments
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.story_vocabulary_enrichments from anon;
revoke insert, update, delete on table public.story_vocabulary_enrichments
  from authenticated;
grant select on table public.story_vocabulary_enrichments to authenticated;

create or replace function public.store_story_vocabulary_enrichment(
  p_request_id uuid,
  p_level public.jlpt_level,
  p_vocabulary jsonb,
  p_source_model text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.custom_lesson_requests%rowtype;
  v_item jsonb;
  v_word text;
  v_reading text;
  v_meaning text;
  v_vocabulary_id uuid;
  v_position integer := 0;
  v_stored integer := 0;
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

  if v_request.jlpt_level <> p_level
     or jsonb_typeof(p_vocabulary) <> 'array'
     or jsonb_array_length(p_vocabulary) > 250 then
    raise exception 'Invalid story vocabulary enrichment payload'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_vocabulary)
  loop
    v_position := v_position + 1;
    v_word := btrim(coalesce(v_item->>'word', ''));
    v_reading := btrim(coalesce(v_item->>'reading', ''));
    v_meaning := btrim(coalesce(v_item->>'meaning', ''));

    if jsonb_typeof(v_item) <> 'object'
       or v_word = ''
       or v_reading = ''
       or v_meaning = ''
       or not (v_item ?& array['word', 'reading', 'meaning']) then
      raise exception 'Invalid raw vocabulary item at position %', v_position
        using errcode = '22023';
    end if;

    insert into public.vocabulary_records (
      written_form,
      dictionary_form,
      reading,
      meaning,
      part_of_speech,
      conjugation_type,
      aliases,
      form_overrides,
      lexicon_schema_version,
      jlpt_level,
      tags,
      example_sentence,
      linked_kanji_ids,
      source_type,
      source_model,
      quality_status,
      source_payload,
      usage_count,
      last_used_at
    ) values (
      v_word,
      v_word,
      v_reading,
      v_meaning,
      'other',
      null,
      '{}',
      '{}'::jsonb,
      4,
      p_level,
      '{}',
      '',
      '{}',
      'ai_enriched',
      left(nullif(btrim(p_source_model), ''), 120),
      'needs_review',
      v_item,
      1,
      now()
    )
    on conflict (written_form, reading, meaning) do update
      set source_payload = coalesce(public.vocabulary_records.source_payload, '{}'::jsonb)
            || excluded.source_payload,
          source_model = coalesce(excluded.source_model, public.vocabulary_records.source_model),
          source_type = 'ai_enriched',
          usage_count = coalesce(public.vocabulary_records.usage_count, 0) + 1,
          last_used_at = now(),
          archived_at = null,
          updated_at = now()
    returning id into v_vocabulary_id;

    insert into public.story_vocabulary_enrichments (
      request_id,
      user_id,
      vocabulary_id,
      position,
      word,
      reading,
      meaning,
      source_model
    ) values (
      p_request_id,
      v_request.user_id,
      v_vocabulary_id,
      v_position,
      v_word,
      v_reading,
      v_meaning,
      left(nullif(btrim(p_source_model), ''), 120)
    )
    on conflict (request_id, word, reading, meaning) do update
      set position = excluded.position,
          vocabulary_id = excluded.vocabulary_id,
          source_model = excluded.source_model;

    v_stored := v_stored + 1;
  end loop;

  return jsonb_build_object(
    'requestId', p_request_id,
    'storedVocabulary', v_stored
  );
end
$$;

revoke all on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) from public;

grant execute on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) to service_role;

comment on table public.story_vocabulary_enrichments is
  'Raw story vocabulary using only the exact word, reading, and meaning returned by the enrichment model.';

comment on column public.story_vocabulary_enrichments.word is
  'Kanji or kana word exactly as it appeared in the generated story.';
comment on column public.story_vocabulary_enrichments.reading is
  'Kana reading returned by the enrichment model.';
comment on column public.story_vocabulary_enrichments.meaning is
  'English meaning returned by the enrichment model.';

comment on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) is
  'Stores exact post-story vocabulary surfaces and makes them immediately reusable by the lesson reader.';
