-- A vocabulary surface and reading identify the reusable raw lesson word.
-- Enrichment may link that existing row to another lesson, but it must not
-- overwrite it or create a second row merely because the model paraphrased
-- the English meaning.

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
  v_linked integer := 0;
  v_inserted integer := 0;
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
     or jsonb_array_length(p_vocabulary) = 0
     or jsonb_array_length(p_vocabulary) > 250 then
    raise exception 'Invalid or empty story vocabulary enrichment payload'
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

    -- Serialize the canonical word/reading lookup so simultaneous lesson
    -- generations cannot both decide the word is new.
    perform pg_advisory_xact_lock(
      hashtextextended(v_word || chr(31) || v_reading, 0)
    );

    v_vocabulary_id := null;
    select record.id
    into v_vocabulary_id
    from public.vocabulary_records record
    where record.written_form = v_word
      and record.reading = v_reading
      and record.archived_at is null
      and record.quality_status <> 'rejected'
    order by record.created_at, record.id
    limit 1;

    if v_vocabulary_id is null then
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
      on conflict (written_form, reading, meaning) do nothing
      returning id into v_vocabulary_id;

      if v_vocabulary_id is not null then
        v_inserted := v_inserted + 1;
      else
        select record.id
        into v_vocabulary_id
        from public.vocabulary_records record
        where record.written_form = v_word
          and record.reading = v_reading
        order by record.created_at, record.id
        limit 1;
      end if;
    end if;

    if v_vocabulary_id is null then
      raise exception 'Vocabulary word could not be linked at position %', v_position
        using errcode = '22023';
    end if;

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

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'requestId', p_request_id,
    'storedVocabulary', v_linked,
    'insertedVocabulary', v_inserted,
    'reusedVocabulary', v_linked - v_inserted
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
  'Links existing word/reading records without modifying them and inserts only vocabulary absent from the reusable library.';
