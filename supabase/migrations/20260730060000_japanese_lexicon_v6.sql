-- Integrate @aiko/japanese-lexicon 6.0.1 with AIko's permanent vocabulary library.
-- Canonical dictionary entries remain stored once; inflected surfaces are
-- reproduced in application code and are never inserted as vocabulary rows.

alter table public.vocabulary_records
  add column if not exists dictionary_form text,
  add column if not exists conjugation_type text,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists form_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(form_overrides) = 'object'),
  add column if not exists lexicon_schema_version integer not null default 4
    check (lexicon_schema_version = 4);

update public.vocabulary_records
set dictionary_form = written_form
where dictionary_form is null or trim(dictionary_form) = '';

alter table public.vocabulary_records
  alter column dictionary_form set not null;

alter table public.vocabulary_records
  drop constraint if exists vocabulary_records_conjugation_type_check;

alter table public.vocabulary_records
  add constraint vocabulary_records_conjugation_type_check
  check (
    conjugation_type is null or conjugation_type in (
      'ichidan', 'godan-u', 'godan-ku', 'godan-gu', 'godan-su',
      'godan-tsu', 'godan-nu', 'godan-bu', 'godan-mu', 'godan-ru',
      'suru', 'kuru', 'aru'
    )
  );

create index if not exists vocabulary_records_lexicon_lookup_idx
  on public.vocabulary_records (dictionary_form, reading, part_of_speech)
  where archived_at is null and quality_status <> 'rejected';

create index if not exists vocabulary_records_alias_lookup_idx
  on public.vocabulary_records using gin (aliases)
  where archived_at is null and quality_status <> 'rejected';

create or replace function public.enrich_custom_lesson_library_v3(
  p_level public.jlpt_level,
  p_seed jsonb,
  p_source_model text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_result jsonb;
  v_item jsonb;
  v_existing public.vocabulary_records%rowtype;
  v_dictionary_form text;
  v_reading text;
  v_meaning text;
  v_part_of_speech text;
  v_conjugation_type text;
  v_aliases text[];
  v_linked_kanji uuid[];
  v_inserted_vocabulary integer := 0;
  v_updated_vocabulary integer := 0;
begin
  if jsonb_typeof(p_seed) <> 'object'
     or jsonb_typeof(p_seed->'kanji') <> 'array'
     or jsonb_typeof(p_seed->'grammar') <> 'array'
     or jsonb_typeof(p_seed->'vocabulary') <> 'array'
     or jsonb_array_length(p_seed->'kanji') > 20
     or jsonb_array_length(p_seed->'grammar') > 10
     or jsonb_array_length(p_seed->'vocabulary') > 80 then
    raise exception 'Invalid lesson lexicon enrichment payload'
      using errcode = '22023';
  end if;

  -- Preserve the existing authorization, subscription, and catalog checks.
  v_base_result := public.enrich_custom_lesson_library_v2(
    p_level,
    jsonb_build_object(
      'kanji', p_seed->'kanji',
      'grammar', p_seed->'grammar',
      'vocabulary', '[]'::jsonb
    ),
    p_source_model
  );

  for v_item in select value from jsonb_array_elements(p_seed->'vocabulary')
  loop
    v_dictionary_form := trim(coalesce(v_item->>'writtenForm', ''));
    v_reading := trim(coalesce(v_item->>'reading', ''));
    v_meaning := trim(coalesce(v_item->>'meaning', ''));
    v_part_of_speech := trim(coalesce(v_item->>'partOfSpeech', ''));
    v_conjugation_type := nullif(trim(coalesce(v_item->>'conjugationType', '')), '');

    if v_dictionary_form = ''
       or v_reading = ''
       or v_meaning = ''
       or v_part_of_speech = ''
       or coalesce((v_item->>'lexiconSchemaVersion')::integer, 0) <> 4
       or jsonb_typeof(coalesce(v_item->'aliases', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(v_item->'formOverrides', '{}'::jsonb)) <> 'object'
       or (
         v_item ? 'linkedKanjiCharacters'
         and jsonb_typeof(v_item->'linkedKanjiCharacters') <> 'array'
       ) then
      raise exception 'Invalid canonical vocabulary enrichment'
        using errcode = '22023';
    end if;

    if (v_part_of_speech = 'verb' and v_conjugation_type is null)
       or (v_part_of_speech <> 'verb' and v_conjugation_type is not null)
       or (
         v_conjugation_type is not null
         and v_conjugation_type not in (
           'ichidan', 'godan-u', 'godan-ku', 'godan-gu', 'godan-su',
           'godan-tsu', 'godan-nu', 'godan-bu', 'godan-mu', 'godan-ru',
           'suru', 'kuru', 'aru'
         )
       ) then
      raise exception 'Invalid vocabulary conjugation metadata'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(coalesce(v_item->'aliases', '[]'::jsonb)) alias(value)
      where trim(alias.value) = '' or trim(alias.value) = v_dictionary_form
    ) then
      raise exception 'Invalid vocabulary spelling alias'
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_item->'linkedKanjiCharacters', '[]'::jsonb)
      ) characters(value)
      where not exists (
        select 1
        from public.kanji_records record
        where record.character = characters.value
          and record.archived_at is null
          and record.quality_status <> 'rejected'
      )
    ) then
      raise exception 'Vocabulary references an unknown kanji'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(record.id), '{}')
    into v_linked_kanji
    from public.kanji_records record
    where record.character in (
      select jsonb_array_elements_text(
        coalesce(v_item->'linkedKanjiCharacters', '[]'::jsonb)
      )
    )
      and record.archived_at is null
      and record.quality_status <> 'rejected';

    select coalesce(array_agg(distinct trim(alias.value)), '{}')
    into v_aliases
    from jsonb_array_elements_text(coalesce(v_item->'aliases', '[]'::jsonb)) alias(value)
    where trim(alias.value) <> '';

    -- Serialize writes for a canonical lemma identity. English paraphrases are
    -- metadata updates, not new vocabulary records.
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
      if v_existing.conjugation_type is not null
         and v_conjugation_type is not null
         and v_existing.conjugation_type <> v_conjugation_type then
        raise exception 'Conflicting vocabulary conjugation class for %', v_dictionary_form
          using errcode = '22023';
      end if;

      update public.vocabulary_records
      set dictionary_form = v_dictionary_form,
          conjugation_type = coalesce(conjugation_type, v_conjugation_type),
          aliases = array(
            select distinct alias
            from unnest(coalesce(aliases, '{}') || coalesce(v_aliases, '{}')) alias
            where trim(alias) <> '' and trim(alias) <> v_dictionary_form
          ),
          form_overrides = case
            when form_overrides = '{}'::jsonb
              then coalesce(v_item->'formOverrides', '{}'::jsonb)
            else form_overrides
          end,
          lexicon_schema_version = 4,
          linked_kanji_ids = array(
            select distinct id
            from unnest(coalesce(linked_kanji_ids, '{}') || coalesce(v_linked_kanji, '{}')) id
          ),
          source_payload = coalesce(source_payload, '{}'::jsonb) || v_item,
          usage_count = coalesce(usage_count, 0) + 1,
          last_used_at = now(),
          updated_at = now()
      where id = v_existing.id;

      v_updated_vocabulary := v_updated_vocabulary + 1;
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
        coalesce(v_item->'formOverrides', '{}'::jsonb),
        4,
        p_level,
        coalesce(array(select jsonb_array_elements_text(v_item->'tags')), '{}'),
        coalesce(v_item->>'exampleSentence', ''),
        coalesce(v_linked_kanji, '{}'),
        'ai_enriched',
        left(nullif(trim(p_source_model), ''), 120),
        'needs_review',
        v_item,
        1,
        now()
      )
      on conflict do nothing;

      if found then
        v_inserted_vocabulary := v_inserted_vocabulary + 1;
      else
        v_updated_vocabulary := v_updated_vocabulary + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', jsonb_build_object(
      'kanji', coalesce((v_base_result->'inserted'->>'kanji')::integer, 0),
      'grammar', coalesce((v_base_result->'inserted'->>'grammar')::integer, 0),
      'vocabulary', v_inserted_vocabulary
    ),
    'updated', jsonb_build_object('vocabulary', v_updated_vocabulary),
    'lexiconSchemaVersion', 4
  );
end
$$;

revoke all on function public.enrich_custom_lesson_library_v3(
  public.jlpt_level,
  jsonb,
  text
) from public;

grant execute on function public.enrich_custom_lesson_library_v3(
  public.jlpt_level,
  jsonb,
  text
) to authenticated;
