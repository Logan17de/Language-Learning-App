-- Replace model-authored story vocabulary with deterministic JMdict-backed
-- dictionary records. The exact story surface remains per-request metadata,
-- while the reusable vocabulary row stores the canonical dictionary lemma.

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
  v_dictionary_form text;
  v_reading text;
  v_meaning text;
  v_part_of_speech text;
  v_conjugation_type text;
  v_aliases text[];
  v_vocabulary_id uuid;
  v_existing public.vocabulary_records%rowtype;
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
     or jsonb_array_length(p_vocabulary) < 1
     or jsonb_array_length(p_vocabulary) > 250 then
    raise exception 'Invalid dictionary story vocabulary payload'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_vocabulary)
  loop
    v_position := v_position + 1;
    v_word := btrim(coalesce(v_item->>'word', ''));
    v_dictionary_form := btrim(coalesce(v_item->>'dictionaryForm', ''));
    v_reading := btrim(coalesce(v_item->>'reading', ''));
    v_meaning := btrim(coalesce(v_item->>'meaning', ''));
    v_part_of_speech := btrim(coalesce(v_item->>'partOfSpeech', ''));
    v_conjugation_type := nullif(btrim(coalesce(v_item->>'conjugationType', '')), '');

    if jsonb_typeof(v_item) <> 'object'
       or v_word = ''
       or v_dictionary_form = ''
       or v_reading = ''
       or v_meaning = ''
       or v_part_of_speech not in (
         'noun', 'verb', 'i-adjective', 'na-adjective',
         'adverb', 'expression', 'other'
       )
       or coalesce(v_item->>'source', '') <> 'JMdict'
       or jsonb_typeof(coalesce(v_item->'aliases', '[]'::jsonb)) <> 'array'
       or (
         v_conjugation_type is not null
         and v_conjugation_type not in (
           'ichidan', 'godan-u', 'godan-ku', 'godan-gu', 'godan-su',
           'godan-tsu', 'godan-nu', 'godan-bu', 'godan-mu', 'godan-ru',
           'suru', 'kuru', 'aru'
         )
       )
       or (v_part_of_speech = 'verb' and v_conjugation_type is null)
       or (v_part_of_speech <> 'verb' and v_conjugation_type is not null) then
      raise exception 'Invalid JMdict vocabulary item at position %', v_position
        using errcode = '22023';
    end if;

    -- Keep JMdict spelling variants plus the exact story/activity surface. The
    -- latter lets the local resolver load the canonical row before building its
    -- conjugation index, so inflected Japanese remains tappable.
    select coalesce(array_agg(distinct value), '{}')
    into v_aliases
    from (
      select btrim(alias.value) as value
      from jsonb_array_elements_text(coalesce(v_item->'aliases', '[]'::jsonb)) alias(value)
      where btrim(alias.value) <> ''
        and btrim(alias.value) <> v_dictionary_form
      union
      select v_word
      where v_word <> v_dictionary_form
    ) aliases;

    perform pg_advisory_xact_lock(
      hashtextextended(
        v_dictionary_form || chr(31) || v_reading || chr(31) || v_part_of_speech,
        0
      )
    );

    select *
    into v_existing
    from public.vocabulary_records record
    where record.dictionary_form = v_dictionary_form
      and record.reading = v_reading
      and record.part_of_speech = v_part_of_speech
      and record.archived_at is null
      and record.quality_status <> 'rejected'
    order by record.created_at, record.id
    limit 1
    for update;

    if found then
      v_vocabulary_id := v_existing.id;

      if v_existing.conjugation_type is not null
         and v_conjugation_type is not null
         and v_existing.conjugation_type <> v_conjugation_type then
        raise exception 'Conflicting dictionary conjugation class for %', v_dictionary_form
          using errcode = '22023';
      end if;

      update public.vocabulary_records
      set conjugation_type = coalesce(conjugation_type, v_conjugation_type),
          aliases = array(
            select distinct alias
            from unnest(coalesce(aliases, '{}') || coalesce(v_aliases, '{}')) alias
            where btrim(alias) <> '' and btrim(alias) <> v_dictionary_form
          ),
          source_payload = coalesce(source_payload, '{}'::jsonb)
            || jsonb_build_object('lastDictionaryLookup', v_item),
          usage_count = coalesce(usage_count, 0) + 1,
          last_used_at = now(),
          archived_at = null,
          updated_at = now()
      where id = v_vocabulary_id;
    else
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
        v_dictionary_form,
        v_dictionary_form,
        v_reading,
        v_meaning,
        v_part_of_speech,
        v_conjugation_type,
        coalesce(v_aliases, '{}'),
        '{}'::jsonb,
        4,
        p_level,
        array['dictionary:JMdict']::text[],
        '',
        '{}',
        'imported',
        left(coalesce(nullif(btrim(p_source_model), ''), 'jisho-jmdict'), 120),
        'usable',
        jsonb_build_object('dictionaryLookup', v_item),
        1,
        now()
      )
      returning id into v_vocabulary_id;

      v_inserted := v_inserted + 1;
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
      left(coalesce(nullif(btrim(p_source_model), ''), 'jisho-jmdict'), 120)
    )
    on conflict (request_id, word, reading, meaning) do update
      set vocabulary_id = excluded.vocabulary_id,
          position = least(public.story_vocabulary_enrichments.position, excluded.position),
          source_model = excluded.source_model;

    v_linked := v_linked + 1;
  end loop;

  return jsonb_build_object(
    'requestId', p_request_id,
    'storedVocabulary', v_linked,
    'insertedVocabulary', v_inserted,
    'reusedVocabulary', v_linked - v_inserted,
    'source', 'JMdict'
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
  'Exact lesson surfaces linked to reusable canonical vocabulary resolved from JMdict-backed dictionary data.';

comment on column public.story_vocabulary_enrichments.word is
  'The exact Japanese surface extracted from generated lesson text before dictionary canonicalization.';

comment on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) is
  'Stores JMdict-backed canonical vocabulary and links exact lesson surfaces without any model-authored enrichment.';
