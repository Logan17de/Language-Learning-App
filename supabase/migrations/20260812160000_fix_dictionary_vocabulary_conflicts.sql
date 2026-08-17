-- Make deterministic JMdict story-vocabulary storage compatible with the
-- vocabulary_records table's original unique identity (written_form, reading,
-- meaning). Older story enrichment rows were intentionally stored with the
-- generic part_of_speech = 'other', so looking up only by the newer canonical
-- lemma/read/POS identity can miss the same database row and then collide with
-- the older unique constraint.
--
-- Exact written-form/read/meaning matches are safe to reuse because the current
-- payload has just been resolved against the local JMdict import. Generic
-- legacy metadata is upgraded to the verified JMdict metadata. The insert path
-- also uses ON CONFLICT so concurrent workers remain idempotent.

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
  v_reused_exact integer := 0;
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

    -- Serialize against the database uniqueness identity, not only the newer
    -- lexicon identity. That makes the pre-check and insert race-safe even when
    -- two JMdict senses/POS paths converge on the same stored triple.
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_dictionary_form || chr(31) || v_reading || chr(31) || v_meaning,
        0
      )
    );

    v_vocabulary_id := null;

    -- Prefer the current canonical active identity. English paraphrases remain
    -- metadata and do not create duplicate canonical vocabulary records.
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
          updated_at = now()
      where id = v_vocabulary_id;
    else
      -- Compatibility path for pre-JMdict rows. The original table uniqueness
      -- can identify an existing row even when its legacy POS/dictionary_form
      -- metadata does not match the newer canonical lookup above.
      select *
      into v_existing
      from public.vocabulary_records record
      where record.written_form = v_dictionary_form
        and record.reading = v_reading
        and record.meaning = v_meaning
      order by
        (record.archived_at is null and record.quality_status <> 'rejected') desc,
        record.created_at,
        record.id
      limit 1
      for update;

      if found then
        v_vocabulary_id := v_existing.id;

        -- An exact triple is now independently verified by JMdict. Reactivate
        -- stale generated rows and replace only generic legacy POS metadata;
        -- preserve any more-specific curated POS already present.
        update public.vocabulary_records
        set dictionary_form = v_dictionary_form,
            part_of_speech = case
              when part_of_speech = 'other' then v_part_of_speech
              else part_of_speech
            end,
            conjugation_type = case
              when part_of_speech = 'other' and v_part_of_speech = 'verb'
                then v_conjugation_type
              when part_of_speech = 'verb'
                then coalesce(conjugation_type, v_conjugation_type)
              else conjugation_type
            end,
            aliases = array(
              select distinct alias
              from unnest(coalesce(aliases, '{}') || coalesce(v_aliases, '{}')) alias
              where btrim(alias) <> '' and btrim(alias) <> v_dictionary_form
            ),
            lexicon_schema_version = 4,
            quality_status = case
              when quality_status = 'rejected' then 'usable'
              else quality_status
            end,
            archived_at = null,
            source_payload = coalesce(source_payload, '{}'::jsonb)
              || jsonb_build_object('lastDictionaryLookup', v_item),
            usage_count = coalesce(usage_count, 0) + 1,
            last_used_at = now(),
            updated_at = now()
        where id = v_vocabulary_id;

        v_reused_exact := v_reused_exact + 1;
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
          left(coalesce(nullif(btrim(p_source_model), ''), 'jmdict-local'), 120),
          'usable',
          jsonb_build_object('dictionaryLookup', v_item),
          1,
          now()
        )
        on conflict (written_form, reading, meaning) do nothing
        returning id into v_vocabulary_id;

        if v_vocabulary_id is not null then
          v_inserted := v_inserted + 1;
        else
          -- Defensive race fallback. The advisory lock should serialize this
          -- function, but rows may also be written by other library functions.
          select record.id
          into v_vocabulary_id
          from public.vocabulary_records record
          where record.written_form = v_dictionary_form
            and record.reading = v_reading
            and record.meaning = v_meaning
          order by record.created_at, record.id
          limit 1;

          if v_vocabulary_id is not null then
            update public.vocabulary_records
            set dictionary_form = v_dictionary_form,
                part_of_speech = case
                  when part_of_speech = 'other' then v_part_of_speech
                  else part_of_speech
                end,
                conjugation_type = case
                  when part_of_speech = 'other' and v_part_of_speech = 'verb'
                    then v_conjugation_type
                  when part_of_speech = 'verb'
                    then coalesce(conjugation_type, v_conjugation_type)
                  else conjugation_type
                end,
                aliases = array(
                  select distinct alias
                  from unnest(coalesce(aliases, '{}') || coalesce(v_aliases, '{}')) alias
                  where btrim(alias) <> '' and btrim(alias) <> v_dictionary_form
                ),
                lexicon_schema_version = 4,
                quality_status = case
                  when quality_status = 'rejected' then 'usable'
                  else quality_status
                end,
                archived_at = null,
                source_payload = coalesce(source_payload, '{}'::jsonb)
                  || jsonb_build_object('lastDictionaryLookup', v_item),
                usage_count = coalesce(usage_count, 0) + 1,
                last_used_at = now(),
                updated_at = now()
            where id = v_vocabulary_id;

            v_reused_exact := v_reused_exact + 1;
          end if;
        end if;
      end if;
    end if;

    if v_vocabulary_id is null then
      raise exception 'JMdict vocabulary word could not be linked at position %', v_position
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
      left(coalesce(nullif(btrim(p_source_model), ''), 'jmdict-local'), 120)
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
    'reusedExactLegacyVocabulary', v_reused_exact,
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

comment on function public.store_story_vocabulary_enrichment(
  uuid,
  public.jlpt_level,
  jsonb,
  text
) is
  'Idempotently stores JMdict-backed vocabulary while reusing legacy rows that already occupy the table unique identity.';
