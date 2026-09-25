-- Replace JMdict with the manually curated JLPT vocabulary catalogs committed
-- under Vocabs/. Story vocabulary is now optional and never blocks lesson
-- generation when the curated catalog has no exact match.

-- Retire old reusable rows so story resolution cannot accidentally surface
-- dictionary-derived vocabulary. A matching curated row can be reactivated by
-- store_story_vocabulary_enrichment below.
update public.vocabulary_records
set archived_at = coalesce(archived_at, now()),
    quality_status = 'rejected',
    updated_at = now()
where source_model = 'jmdict-local'
   or 'dictionary:JMdict' = any(coalesce(tags, '{}'::text[]));

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
  if p_request_id is null or p_level is null then
    raise exception 'request id and JLPT level are required' using errcode = '22023';
  end if;
  if btrim(coalesce(p_source_model, '')) <> 'jlpt-curated-csv' then
    raise exception 'Curated JLPT vocabulary source is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_vocabulary) <> 'array' or jsonb_array_length(p_vocabulary) < 1 then
    raise exception 'Curated story vocabulary must be a non-empty array when storage is requested'
      using errcode = '22023';
  end if;

  -- A retry should replace the request's previous tappable links exactly.
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

    if v_word = '' or v_dictionary_form = '' or v_reading = '' or v_meaning = ''
       or v_source_entry = '' or v_source_file = '' then
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
      id,
      written_form,
      dictionary_form,
      reading,
      meaning,
      part_of_speech,
      conjugation_type,
      aliases,
      form_overrides,
      jlpt_level,
      tags,
      example_sentence,
      linked_kanji_ids,
      source_type,
      source_model,
      source_payload,
      quality_status,
      created_by,
      archived_at,
      created_at,
      updated_at
    ) values (
      gen_random_uuid(),
      v_word,
      v_dictionary_form,
      v_reading,
      v_meaning,
      'other',
      null,
      '{}'::text[],
      '{}'::jsonb,
      v_study_level,
      array['source:jlpt-curated', 'study:' || v_study_level_text],
      '',
      v_linked_kanji_ids,
      'imported',
      p_source_model,
      jsonb_build_object(
        'source', 'JLPT curated CSV',
        'sourceEntry', v_source_entry,
        'sourceFile', v_source_file,
        'studyLevel', v_study_level_text
      ),
      'usable',
      null,
      null,
      now(),
      now()
    )
    on conflict (written_form, reading, meaning) do update
      set dictionary_form = excluded.dictionary_form,
          part_of_speech = 'other',
          conjugation_type = null,
          aliases = '{}'::text[],
          form_overrides = '{}'::jsonb,
          jlpt_level = excluded.jlpt_level,
          tags = excluded.tags,
          linked_kanji_ids = excluded.linked_kanji_ids,
          source_type = 'imported',
          source_model = excluded.source_model,
          source_payload = excluded.source_payload,
          quality_status = 'usable',
          archived_at = null,
          updated_at = now()
    returning id into v_vocabulary_id;

    insert into public.story_vocabulary_enrichments (
      request_id,
      position,
      surface,
      reading,
      meaning,
      vocabulary_id,
      created_at,
      updated_at
    ) values (
      p_request_id,
      v_position,
      v_word,
      v_reading,
      v_meaning,
      v_vocabulary_id,
      now(),
      now()
    )
    on conflict (request_id, position) do update
      set surface = excluded.surface,
          reading = excluded.reading,
          meaning = excluded.meaning,
          vocabulary_id = excluded.vocabulary_id,
          updated_at = now();

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'source', 'JLPT curated CSV',
    'sourceModel', p_source_model,
    'vocabularyCount', v_linked
  );
end
$$;

revoke all on function public.store_story_vocabulary_enrichment(uuid, public.jlpt_level, jsonb, text)
  from public;
grant execute on function public.store_story_vocabulary_enrichment(uuid, public.jlpt_level, jsonb, text)
  to service_role;

comment on function public.store_story_vocabulary_enrichment(uuid, public.jlpt_level, jsonb, text) is
  'Stores exact story vocabulary matches from the repository curated JLPT CSV catalogs.';

-- Tappable vocabulary is optional in a playable package. The activity lesson is
-- generated independently from the fixed story, so zero story taps is valid.
do $migration$
declare
  v_body text;
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.store_generated_lesson_package_v2(uuid,jsonb,integer)'
  );

  if v_body is null then
    raise exception 'store_generated_lesson_package_v2 is unavailable';
  end if;

  v_body := replace(
    v_body,
    'jsonb_array_length(p_package->''vocabulary'') = 0',
    'false'
  );
  v_body := replace(
    v_body,
    'jsonb_array_length(p_package->''vocabulary'') not between 8 and 200',
    'false'
  );

  execute format(
    'create or replace function public.store_generated_lesson_package_v2('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );
end
$migration$;

create or replace function public.assert_playable_lesson_package_shape(
  p_package jsonb
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception 'Invalid playable lesson package: package must be an object'
      using errcode = '22023';
  end if;
  if coalesce(p_package->>'schemaVersion', '') <> '2' then
    raise exception 'Invalid playable lesson package: schemaVersion must be 2'
      using errcode = '22023';
  end if;
  if btrim(coalesce(p_package->>'title', '')) = ''
     or btrim(coalesce(p_package->>'japaneseTitle', '')) = ''
     or btrim(coalesce(p_package->>'summary', '')) = '' then
    raise exception 'Invalid playable lesson package: lesson text must not be empty'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'story') <> 'array' or jsonb_array_length(p_package->'story') < 1 then
    raise exception 'Invalid playable lesson package: story must not be empty' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'kanji') <> 'array' or jsonb_array_length(p_package->'kanji') <> 5 then
    raise exception 'Invalid playable lesson package: kanji must contain exactly 5 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'vocabulary') <> 'array' then
    raise exception 'Invalid playable lesson package: vocabulary must be an array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'grammar') <> 'array' or jsonb_array_length(p_package->'grammar') <> 3 then
    raise exception 'Invalid playable lesson package: grammar must contain exactly 3 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'vocabularyQuestions') <> 'array'
     or jsonb_array_length(p_package->'vocabularyQuestions') <> 7 then
    raise exception 'Invalid playable lesson package: vocabularyQuestions must contain exactly 7 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'grammarQuestions') <> 'array'
     or jsonb_array_length(p_package->'grammarQuestions') <> 7 then
    raise exception 'Invalid playable lesson package: grammarQuestions must contain exactly 7 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'readingConversation') <> 'array'
     or jsonb_array_length(p_package->'readingConversation') < 1 then
    raise exception 'Invalid playable lesson package: readingConversation must not be empty' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'readingQuestions') <> 'array'
     or jsonb_array_length(p_package->'readingQuestions') <> 5 then
    raise exception 'Invalid playable lesson package: readingQuestions must contain exactly 5 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'listeningExercises') <> 'array'
     or jsonb_array_length(p_package->'listeningExercises') <> 5 then
    raise exception 'Invalid playable lesson package: listeningExercises must contain exactly 5 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') <> 5 then
    raise exception 'Invalid playable lesson package: speakingExercises must contain exactly 5 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'reviewQuestions') <> 'array'
     or jsonb_array_length(p_package->'reviewQuestions') <> 0 then
    raise exception 'Invalid playable lesson package: reviewQuestions must be empty' using errcode = '22023';
  end if;
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb) from public;
grant execute on function public.assert_playable_lesson_package_shape(jsonb) to service_role;

-- The dedicated JMdict cache and import API are no longer part of the app.
drop function if exists public.lookup_jmdict_vocabulary(text[], integer);
drop function if exists public.jmdict_dictionary_candidates(text);
drop function if exists public.finalize_jmdict_import(text, text, bigint);
drop table if exists public.jmdict_import_state cascade;
drop table if exists public.jmdict_entries cascade;
