-- Premium custom lessons accept only a topic and JLPT level. The backend owns
-- all other generation controls, fills missing reusable library records, links
-- generated content back to those records, and initializes per-user mastery.

alter table public.learner_mastery
  add column if not exists meaning_score integer not null default 100
    check (meaning_score between 0 and 100),
  add column if not exists recognition_score integer not null default 100
    check (recognition_score between 0 and 100),
  add column if not exists pronunciation_score integer not null default 100
    check (pronunciation_score between 0 and 100);

alter table public.lesson_story_words
  add column if not exists library_id uuid,
  add column if not exists library_type text
    check (library_type is null or library_type in ('kanji', 'vocabulary'));

create index if not exists lesson_story_words_library_idx
  on public.lesson_story_words (library_type, library_id)
  where library_id is not null;

create or replace function public.begin_custom_lesson_generation_v2(
  p_topic text,
  p_level public.jlpt_level
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.custom_lesson_requests%rowtype;
  v_job public.generated_lesson_jobs%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_topic, ''))) < 2 or length(p_topic) > 120 then
    raise exception 'Invalid custom lesson request' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.custom_lesson_requests
    where user_id = auth.uid() and created_at >= current_date
  ) >= 5 then
    raise exception 'Daily custom lesson limit reached' using errcode = '54000';
  end if;

  insert into public.custom_lesson_requests (
    user_id,
    topic,
    jlpt_level,
    duration_minutes,
    focus,
    speaking_difficulty,
    note,
    status
  ) values (
    auth.uid(),
    trim(p_topic),
    p_level,
    30,
    'balanced',
    'medium',
    '',
    'generation_pending'
  )
  returning * into v_request;

  insert into public.generated_lesson_jobs (
    custom_lesson_request_id,
    status,
    created_by
  ) values (
    v_request.id,
    'generating',
    auth.uid()
  )
  returning * into v_job;

  return jsonb_build_object(
    'request_id', v_request.id,
    'job_id', v_job.id,
    'level', p_level,
    'interests', to_jsonb(v_profile.interests)
  );
end
$$;

create or replace function public.enrich_custom_lesson_library(
  p_level public.jlpt_level,
  p_seed jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_item jsonb;
  v_linked_kanji uuid[];
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_seed) <> 'object'
     or jsonb_typeof(p_seed->'kanji') <> 'array'
     or jsonb_typeof(p_seed->'grammar') <> 'array'
     or jsonb_typeof(p_seed->'vocabulary') <> 'array'
     or jsonb_array_length(p_seed->'kanji') > 5
     or jsonb_array_length(p_seed->'grammar') > 3
     or jsonb_array_length(p_seed->'vocabulary') > 36
     or (
       jsonb_array_length(p_seed->'kanji') = 0
       and jsonb_array_length(p_seed->'grammar') = 0
       and jsonb_array_length(p_seed->'vocabulary') = 0
     ) then
    raise exception 'Invalid lesson library seed' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_seed->'kanji')
  loop
    insert into public.kanji_records (
      character,
      jlpt_level,
      meanings,
      readings,
      onyomi,
      kunyomi,
      example_words,
      stroke_count
    ) values (
      trim(v_item->>'character'),
      p_level,
      coalesce(array(select jsonb_array_elements_text(v_item->'meanings')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'readings')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'onyomi')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'kunyomi')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'exampleWords')), '{}'),
      greatest(1, least(64, coalesce((v_item->>'strokeCount')::integer, 1)))
    )
    on conflict (character) do nothing;
  end loop;

  for v_item in select value from jsonb_array_elements(p_seed->'grammar')
  loop
    insert into public.grammar_records (
      pattern,
      jlpt_level,
      meaning,
      formation,
      usage_notes,
      nuance,
      example_sentences
    ) values (
      trim(v_item->>'pattern'),
      p_level,
      trim(v_item->>'meaning'),
      trim(v_item->>'formation'),
      coalesce(v_item->>'usageNotes', ''),
      coalesce(v_item->>'nuance', ''),
      coalesce(array(select jsonb_array_elements_text(v_item->'exampleSentences')), '{}')
    )
    on conflict (pattern, jlpt_level) do nothing;
  end loop;

  for v_item in select value from jsonb_array_elements(p_seed->'vocabulary')
  loop
    select coalesce(array_agg(kanji_row.id), '{}')
    into v_linked_kanji
    from public.kanji_records as kanji_row
    where kanji_row.character in (
      select jsonb_array_elements_text(v_item->'linkedKanjiCharacters')
    );

    insert into public.vocabulary_records (
      written_form,
      reading,
      meaning,
      part_of_speech,
      jlpt_level,
      tags,
      example_sentence,
      linked_kanji_ids
    ) values (
      trim(v_item->>'writtenForm'),
      trim(v_item->>'reading'),
      trim(v_item->>'meaning'),
      coalesce(nullif(trim(v_item->>'partOfSpeech'), ''), 'other'),
      p_level,
      coalesce(array(select jsonb_array_elements_text(v_item->'tags')), '{}'),
      coalesce(v_item->>'exampleSentence', ''),
      v_linked_kanji
    )
    on conflict (written_form, reading, meaning) do nothing;
  end loop;

  return jsonb_build_object(
    'kanji_count', (select count(*) from public.kanji_records where archived_at is null),
    'grammar_count', (select count(*) from public.grammar_records where archived_at is null),
    'vocabulary_count', (select count(*) from public.vocabulary_records where archived_at is null)
  );
end
$$;

create or replace function public.attach_generated_lesson_package(
  p_request_id uuid,
  p_lesson_version_id uuid,
  p_generation_package jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_term record;
  v_target record;
  v_story_line_id uuid;
  v_library_id uuid;
  v_library_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_generation_package) <> 'object'
     or coalesce((p_generation_package->>'schemaVersion')::integer, 0) <> 1
     or jsonb_typeof(p_generation_package->'blueprint') <> 'object'
     or jsonb_typeof(p_generation_package->'story') <> 'object'
     or jsonb_typeof(p_generation_package->'vocabulary') <> 'object'
     or jsonb_typeof(p_generation_package->'grammar') <> 'object'
     or jsonb_typeof(p_generation_package->'listening') <> 'object'
     or jsonb_typeof(p_generation_package->'speaking') <> 'object'
     or jsonb_typeof(p_generation_package->'interactive') <> 'object' then
    raise exception 'Invalid universal generation package' using errcode = '22023';
  end if;

  update public.lesson_versions as version
  set metadata = coalesce(version.metadata, '{}'::jsonb)
    || jsonb_build_object('generationPackage', p_generation_package)
  from public.lessons as lesson, public.custom_lesson_requests as request
  where version.id = p_lesson_version_id
    and lesson.id = version.lesson_id
    and lesson.generated_for_user_id = auth.uid()
    and request.id = p_request_id
    and request.user_id = auth.uid()
    and request.generated_lesson_id = lesson.id;

  if not found then
    raise exception 'Generated lesson package unavailable' using errcode = '42501';
  end if;

  for v_target in
    select value, ordinality
    from jsonb_array_elements(p_generation_package->'blueprint'->'coreVocabularyIds')
      with ordinality
  loop
    update public.lesson_vocabulary
    set vocabulary_id = (v_target.value #>> '{}')::uuid,
        updated_at = now()
    where lesson_version_id = p_lesson_version_id
      and position = v_target.ordinality;
  end loop;

  for v_target in
    select value, ordinality
    from jsonb_array_elements(p_generation_package->'targets'->'grammar')
      with ordinality
  loop
    update public.lesson_grammar
    set grammar_id = (v_target.value->>'id')::uuid,
        updated_at = now()
    where lesson_version_id = p_lesson_version_id
      and position = v_target.ordinality;
  end loop;

  delete from public.lesson_story_words
  where lesson_version_id = p_lesson_version_id;

  for v_line in
    select value, ordinality
    from jsonb_array_elements(p_generation_package->'story'->'lines')
      with ordinality
  loop
    select id into v_story_line_id
    from public.lesson_story_lines
    where lesson_version_id = p_lesson_version_id
      and position = v_line.ordinality;

    for v_term in
      select value, ordinality
      from jsonb_array_elements(v_line.value->'inspectableTerms')
        with ordinality
    loop
      v_library_id := (v_term.value->>'libraryId')::uuid;
      v_library_type := case
        when exists (
          select 1
          from jsonb_array_elements(p_generation_package->'targets'->'kanji') as target
          where target.value->>'id' = v_term.value->>'libraryId'
        ) then 'kanji'
        else 'vocabulary'
      end;

      insert into public.lesson_story_words (
        lesson_version_id,
        story_line_id,
        position,
        surface,
        reading,
        meaning,
        script_type,
        library_id,
        library_type
      ) values (
        p_lesson_version_id,
        v_story_line_id,
        v_term.ordinality,
        v_term.value->>'surface',
        v_term.value->>'reading',
        v_term.value->>'meaning',
        v_term.value->>'scriptType',
        v_library_id,
        v_library_type
      );
    end loop;
  end loop;

  for v_target in
    select value
    from jsonb_array_elements(p_generation_package->'targets'->'kanji')
  loop
    insert into public.learner_mastery (
      user_id,
      item_type,
      item_key,
      mastery,
      confidence,
      evidence_count,
      meaning_score,
      recognition_score,
      pronunciation_score
    ) values (
      auth.uid(),
      'kanji',
      v_target.value->>'id',
      0,
      0,
      0,
      100,
      100,
      100
    )
    on conflict (user_id, item_type, item_key) do nothing;
  end loop;

  for v_target in
    select value
    from jsonb_array_elements(p_generation_package->'targets'->'grammar')
  loop
    insert into public.learner_mastery (
      user_id,
      item_type,
      item_key,
      mastery,
      confidence,
      evidence_count,
      meaning_score,
      recognition_score,
      pronunciation_score
    ) values (
      auth.uid(),
      'grammar',
      v_target.value->>'id',
      0,
      0,
      0,
      100,
      100,
      100
    )
    on conflict (user_id, item_type, item_key) do nothing;
  end loop;

  for v_target in
    select value
    from jsonb_array_elements(p_generation_package->'blueprint'->'coreVocabularyIds')
  loop
    insert into public.learner_mastery (
      user_id,
      item_type,
      item_key,
      mastery,
      confidence,
      evidence_count,
      meaning_score,
      recognition_score,
      pronunciation_score
    ) values (
      auth.uid(),
      'vocabulary',
      v_target.value #>> '{}',
      0,
      0,
      0,
      100,
      100,
      100
    )
    on conflict (user_id, item_type, item_key) do nothing;
  end loop;

  return true;
end
$$;

revoke all on function public.begin_custom_lesson_generation_v2(text, public.jlpt_level) from public;
revoke all on function public.enrich_custom_lesson_library(public.jlpt_level, jsonb) from public;
revoke all on function public.attach_generated_lesson_package(uuid, uuid, jsonb) from public;

grant execute on function public.begin_custom_lesson_generation_v2(text, public.jlpt_level) to authenticated;
grant execute on function public.enrich_custom_lesson_library(public.jlpt_level, jsonb) to authenticated;
grant execute on function public.attach_generated_lesson_package(uuid, uuid, jsonb) to authenticated;
