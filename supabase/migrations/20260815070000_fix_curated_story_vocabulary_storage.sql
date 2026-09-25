-- Fix the curated JLPT story-vocabulary RPC to match the deployed table schemas.
--
-- 20260813080000_curated_jlpt_vocabulary.sql accidentally referenced columns
-- from a different draft shape (`vocabulary_records.created_by` and
-- `story_vocabulary_enrichments.surface/updated_at`). Those columns do not
-- exist in the production schema. Keep the curated CSV behavior, but write
-- through the canonical vocabulary/enrichment columns that already back the
-- working story pipeline.

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
  v_position integer := 0;
  v_vocabulary_id uuid;
  v_word text;
  v_dictionary_form text;
  v_reading text;
  v_meaning text;
  v_source_entry text;
  v_source_file text;
  v_study_level_text text;
  v_study_level public.jlpt_level;
  v_linked_kanji_ids uuid[];
  v_linked integer := 0;
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

  if v_request.jlpt_level <> p_level then
    raise exception 'Generation request JLPT level does not match vocabulary payload'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_source_model, '')) <> 'jlpt-curated-csv' then
    raise exception 'Curated JLPT vocabulary source is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_vocabulary) <> 'array'
     or jsonb_array_length(p_vocabulary) < 1
     or jsonb_array_length(p_vocabulary) > 250 then
    raise exception 'Curated story vocabulary must contain between 1 and 250 items'
      using errcode = '22023';
  end if;

  -- A retry replaces the request's tappable vocabulary links exactly.
  delete from public.story_vocabulary_enrichments
  where request_id = p_request_id;

  for v_item in select value from jsonb_array_elements(p_vocabulary)
  loop
    v_position := v_position + 1;
    v_word := btrim(coalesce(v_item->>'word', ''));
    v_dictionary_form := btrim(coalesce(v_item->>'dictionaryForm', v_word));
    v_reading := btrim(coalesce(v_item->>'reading', ''));
    v_meaning := btrim(coalesce(v_item->>'meaning', ''));
    v_source_entry := btrim(coalesce(v_item->>'sourceEntry', ''));
    v_source_file := btrim(coalesce(v_item->>'sourceFile', ''));
    v_study_level_text := btrim(coalesce(v_item->>'studyLevel', ''));

    if jsonb_typeof(v_item) <> 'object'
       or v_word = ''
       or v_dictionary_form = ''
       or v_reading = ''
       or v_meaning = ''
       or v_source_entry = ''
       or v_source_file = '' then
      raise exception 'Curated vocabulary item % is incomplete', v_position
        using errcode = '22023';
    end if;

    if coalesce(v_item->>'source', '') <> 'JLPT curated CSV' then
      raise exception 'Curated vocabulary item % has an invalid source', v_position
        using errcode = '22023';
    end if;

    if v_study_level_text not in ('N5', 'N4', 'N3', 'N2', 'N1') then
      raise exception 'Curated vocabulary item % has an invalid study level', v_position
        using errcode = '22023';
    end if;
    v_study_level := v_study_level_text::public.jlpt_level;

    select coalesce(array_agg(record.id order by record.character), '{}'::uuid[])
    into v_linked_kanji_ids
    from public.kanji_records record
    where record.archived_at is null
      and record.quality_status <> 'rejected'
      and strpos(v_dictionary_form, record.character) > 0;

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
      v_dictionary_form,
      v_reading,
      v_meaning,
      'other',
      null,
      '{}'::text[],
      '{}'::jsonb,
      4,
      v_study_level,
      array['source:jlpt-curated', 'study:' || v_study_level_text]::text[],
      '',
      v_linked_kanji_ids,
      'imported',
      'jlpt-curated-csv',
      'usable',
      jsonb_build_object(
        'source', 'JLPT curated CSV',
        'sourceEntry', v_source_entry,
        'sourceFile', v_source_file,
        'studyLevel', v_study_level_text
      ),
      1,
      now()
    )
    on conflict (written_form, reading, meaning) do update
      set dictionary_form = excluded.dictionary_form,
          part_of_speech = 'other',
          conjugation_type = null,
          aliases = '{}'::text[],
          form_overrides = '{}'::jsonb,
          lexicon_schema_version = 4,
          jlpt_level = excluded.jlpt_level,
          tags = excluded.tags,
          linked_kanji_ids = excluded.linked_kanji_ids,
          source_type = 'imported',
          source_model = 'jlpt-curated-csv',
          source_payload = excluded.source_payload,
          quality_status = 'usable',
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
      'jlpt-curated-csv'
    )
    on conflict (request_id, word, reading, meaning) do update
      set position = excluded.position,
          vocabulary_id = excluded.vocabulary_id,
          source_model = excluded.source_model;

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'requestId', p_request_id,
    'source', 'JLPT curated CSV',
    'sourceModel', 'jlpt-curated-csv',
    'vocabularyCount', v_linked
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

comment on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) is
  'Stores exact story vocabulary matches from the curated JLPT CSV catalogs using the deployed vocabulary/enrichment schemas.';
