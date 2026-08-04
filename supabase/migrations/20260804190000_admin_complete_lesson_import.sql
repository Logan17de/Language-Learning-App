-- Import a complete, externally authored lesson without invoking any model.
-- Staff JSON is validated in the application and stored transactionally here.

create or replace function public.resolve_admin_lesson_target_ids(
  p_level public.jlpt_level,
  p_refs jsonb
)
returns uuid[]
language sql
stable
set search_path = public
as $$
  with refs as (
    select value as ref
    from jsonb_array_elements_text(coalesce(p_refs, '[]'::jsonb))
  ), resolved as (
    select record.id
    from refs
    join public.kanji_records record
      on refs.ref like 'kanji:%'
     and record.character = substring(refs.ref from position(':' in refs.ref) + 1)
     and record.archived_at is null
    union
    select record.id
    from refs
    join public.vocabulary_records record
      on refs.ref like 'vocabulary:%'
     and record.written_form = substring(refs.ref from position(':' in refs.ref) + 1)
     and record.archived_at is null
    union
    select record.id
    from refs
    join public.grammar_records record
      on refs.ref like 'grammar:%'
     and record.pattern = substring(refs.ref from position(':' in refs.ref) + 1)
     and record.jlpt_level = p_level
     and record.archived_at is null
  )
  select coalesce(array_agg(id), '{}') from resolved
$$;

create or replace function public.build_admin_lesson_inspectable_terms(
  p_level public.jlpt_level,
  p_text text,
  p_vocabulary jsonb,
  p_kanji jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with vocabulary_terms as (
    select
      record.id,
      item.value->>'term' as surface,
      item.value->>'reading' as reading,
      item.value->>'meaning' as meaning,
      'vocabulary'::text as library_type,
      item.ordinality as position
    from jsonb_array_elements(coalesce(p_vocabulary, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.vocabulary_records record
      on record.written_form = item.value->>'term'
     and record.reading = item.value->>'reading'
     and record.meaning = item.value->>'meaning'
     and record.archived_at is null
    where position(item.value->>'term' in coalesce(p_text, '')) > 0
  ), kanji_terms as (
    select
      record.id,
      item.value->>'character' as surface,
      item.value->>'reading' as reading,
      item.value->>'meaning' as meaning,
      'kanji'::text as library_type,
      1000 + item.ordinality as position
    from jsonb_array_elements(coalesce(p_kanji, '[]'::jsonb))
      with ordinality as item(value, ordinality)
    join public.kanji_records record
      on record.character = item.value->>'character'
     and record.archived_at is null
    where position(item.value->>'character' in coalesce(p_text, '')) > 0
      and not exists (
        select 1 from vocabulary_terms vocabulary
        where vocabulary.surface = item.value->>'character'
      )
  ), combined as (
    select * from vocabulary_terms
    union all
    select * from kanji_terms
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'libraryId', id::text,
        'libraryType', library_type,
        'surface', surface,
        'reading', reading,
        'meaning', meaning,
        'scriptType', case
          when surface ~ '[一-龯々]' then 'kanji'
          when surface ~ '^[ァ-ヶー]+$' then 'katakana'
          else 'hiragana'
        end
      ) order by char_length(surface) desc, position
    ),
    '[]'::jsonb
  )
  from combined
$$;

create or replace function public.import_complete_lesson(
  p_package jsonb,
  p_publish boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lesson public.lessons%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_version_number integer;
  v_level public.jlpt_level;
  v_status public.lesson_status;
  v_slug text;
  v_signature text;
  v_line record;
  v_word record;
  v_item record;
  v_story_line_id uuid;
  v_library_id uuid;
  v_library_type text;
  v_target_kanji jsonb;
  v_text text;
begin
  if not public.has_app_role(array['admin', 'content_editor']::public.app_role[]) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package) <> 'object'
     or coalesce((p_package->>'schemaVersion')::integer, 0) <> 1
     or nullif(btrim(p_package->>'id'), '') is null
     or nullif(btrim(p_package->>'title'), '') is null
     or nullif(btrim(p_package->>'japaneseTitle'), '') is null
     or nullif(btrim(p_package->>'topic'), '') is null
     or nullif(btrim(p_package->>'summary'), '') is null
     or p_package->>'level' not in ('N5', 'N4', 'N3', 'N2', 'N1')
     or jsonb_typeof(p_package->'kanji') <> 'array'
     or jsonb_array_length(p_package->'kanji') <> 5
     or jsonb_typeof(p_package->'grammar') <> 'array'
     or jsonb_array_length(p_package->'grammar') <> 3
     or jsonb_typeof(p_package->'vocabulary') <> 'array'
     or jsonb_array_length(p_package->'vocabulary') not between 8 and 80
     or jsonb_typeof(p_package->'story') <> 'array'
     or jsonb_array_length(p_package->'story') not between 1 and 6
     or jsonb_typeof(p_package->'vocabularyQuestions') <> 'array'
     or jsonb_array_length(p_package->'vocabularyQuestions') <> 13
     or jsonb_typeof(p_package->'grammarQuestions') <> 'array'
     or jsonb_array_length(p_package->'grammarQuestions') <> 10
     or jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') <> 5
     or jsonb_typeof(p_package->'readingConversation') <> 'array'
     or jsonb_array_length(p_package->'readingConversation') not between 1 and 6
     or jsonb_typeof(p_package->'readingQuestions') <> 'array'
     or jsonb_array_length(p_package->'readingQuestions') <> 5
     or jsonb_typeof(p_package->'listeningExercises') <> 'array'
     or jsonb_array_length(p_package->'listeningExercises') <> 5
     or jsonb_typeof(p_package->'reviewQuestions') <> 'array'
     or jsonb_array_length(p_package->'reviewQuestions') <> 5 then
    raise exception 'Invalid complete lesson package' using errcode = '22023';
  end if;

  v_level := (p_package->>'level')::public.jlpt_level;
  v_status := case when p_publish then 'published' else 'draft' end;

  -- Add new reusable language records while preserving any existing curated data.
  for v_item in
    select value from jsonb_array_elements(p_package->'kanji')
  loop
    insert into public.kanji_records (
      character, jlpt_level, meanings, readings, stroke_count,
      source_type, quality_status, source_payload, usage_count, last_used_at
    ) values (
      btrim(v_item.value->>'character'), v_level,
      array[btrim(v_item.value->>'meaning')],
      array[btrim(v_item.value->>'reading')],
      1, 'imported', 'needs_review', v_item.value, 1, now()
    )
    on conflict (character) do update
      set usage_count = public.kanji_records.usage_count + 1,
          last_used_at = now(),
          archived_at = null,
          quality_status = case
            when public.kanji_records.quality_status = 'rejected' then 'needs_review'
            else public.kanji_records.quality_status
          end,
          updated_at = now();
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_package->'grammar')
  loop
    insert into public.grammar_records (
      pattern, jlpt_level, meaning, formation, usage_notes, example_sentences,
      common_mistakes, source_type, quality_status, source_payload,
      usage_count, last_used_at
    ) values (
      btrim(v_item.value->>'pattern'), v_level,
      btrim(v_item.value->>'meaning'), btrim(v_item.value->>'structure'),
      coalesce(v_item.value->>'usage', ''),
      array[coalesce(v_item.value->>'example', '')],
      case when btrim(coalesce(v_item.value->>'commonMistake', '')) = ''
        then '{}'::text[] else array[v_item.value->>'commonMistake'] end,
      'imported', 'needs_review', v_item.value, 1, now()
    )
    on conflict (pattern, jlpt_level) do update
      set usage_count = public.grammar_records.usage_count + 1,
          last_used_at = now(),
          archived_at = null,
          quality_status = case
            when public.grammar_records.quality_status = 'rejected' then 'needs_review'
            else public.grammar_records.quality_status
          end,
          updated_at = now();
  end loop;

  for v_item in
    select value from jsonb_array_elements(p_package->'vocabulary')
  loop
    insert into public.vocabulary_records (
      written_form, dictionary_form, reading, meaning, part_of_speech,
      jlpt_level, tags, example_sentence, source_type, quality_status,
      source_payload, usage_count, last_used_at, aliases, form_overrides,
      lexicon_schema_version
    ) values (
      btrim(v_item.value->>'term'), btrim(v_item.value->>'term'),
      btrim(v_item.value->>'reading'), btrim(v_item.value->>'meaning'),
      case
        when lower(coalesce(v_item.value->>'partOfSpeech', '')) = 'verb'
          then 'verb expression'
        else coalesce(nullif(btrim(v_item.value->>'partOfSpeech'), ''), 'other')
      end,
      v_level, '{}', coalesce(v_item.value->>'exampleSentence', ''),
      'imported', 'needs_review', v_item.value, 1, now(), '{}', '{}', 4
    )
    on conflict (written_form, reading, meaning) do update
      set usage_count = public.vocabulary_records.usage_count + 1,
          last_used_at = now(),
          archived_at = null,
          quality_status = case
            when public.vocabulary_records.quality_status = 'rejected' then 'needs_review'
            else public.vocabulary_records.quality_status
          end,
          updated_at = now();
  end loop;

  select coalesce(
    jsonb_agg(
      item.value || jsonb_build_object('libraryId', record.id::text)
      order by item.ordinality
    ),
    '[]'::jsonb
  )
  into v_target_kanji
  from jsonb_array_elements(p_package->'kanji')
    with ordinality as item(value, ordinality)
  join public.kanji_records record
    on record.character = item.value->>'character';

  v_slug := trim(both '-' from lower(regexp_replace(p_package->>'title', '[^a-zA-Z0-9]+', '-', 'g')));
  v_signature := encode(digest((p_package - 'id')::text, 'sha256'), 'hex');

  select * into v_lesson
  from public.lessons
  where legacy_id = p_package->>'id'
  limit 1
  for update;

  if not found then
    insert into public.lessons (
      legacy_id, slug, title, japanese_title, summary, topic, jlpt_level,
      duration_minutes, status, source, tags, published_at, content_signature,
      reusable, created_by, updated_by
    ) values (
      p_package->>'id',
      coalesce(nullif(v_slug, ''), 'imported-lesson') || '-' || left(gen_random_uuid()::text, 8),
      left(btrim(p_package->>'title'), 180),
      left(btrim(p_package->>'japaneseTitle'), 180),
      left(btrim(p_package->>'summary'), 1000),
      left(btrim(p_package->>'topic'), 180),
      v_level,
      greatest(5, least(120, (p_package->>'durationMinutes')::integer)),
      v_status, 'admin_created',
      coalesce(array(select left(value, 60) from jsonb_array_elements_text(coalesce(p_package->'tags', '[]')) limit 12), '{}'),
      case when p_publish then now() else null end,
      v_signature, true, auth.uid(), auth.uid()
    ) returning * into v_lesson;
  else
    update public.lessons
    set title = left(btrim(p_package->>'title'), 180),
        japanese_title = left(btrim(p_package->>'japaneseTitle'), 180),
        summary = left(btrim(p_package->>'summary'), 1000),
        topic = left(btrim(p_package->>'topic'), 180),
        jlpt_level = v_level,
        duration_minutes = greatest(5, least(120, (p_package->>'durationMinutes')::integer)),
        tags = coalesce(array(select left(value, 60) from jsonb_array_elements_text(coalesce(p_package->'tags', '[]')) limit 12), '{}'),
        content_signature = v_signature,
        reusable = true,
        status = case when p_publish then 'published' else public.lessons.status end,
        published_at = case when p_publish then now() else public.lessons.published_at end,
        archived_at = null,
        updated_by = auth.uid(),
        updated_at = now()
    where id = v_lesson.id
    returning * into v_lesson;
  end if;

  update public.lesson_versions
  set status = 'archived', updated_at = now()
  where lesson_id = v_lesson.id
    and status in ('draft', 'generated', 'checking', 'needs_review', 'approved');

  select coalesce(max(version_number), 0) + 1
  into v_version_number
  from public.lesson_versions
  where lesson_id = v_lesson.id;

  insert into public.lesson_versions (
    id, lesson_id, version_number, status, change_summary, schema_version,
    answer_keys, review_items, phases, metadata, published_at, created_by
  ) values (
    v_version_id, v_lesson.id, v_version_number, v_status,
    'Complete lesson imported from the admin workspace', 3,
    coalesce(array(
      select value->>'correctAnswer' from jsonb_array_elements(p_package->'vocabularyQuestions')
      union all select value->>'correctAnswer' from jsonb_array_elements(p_package->'grammarQuestions')
      union all select value->>'answer' from jsonb_array_elements(p_package->'readingQuestions')
      union all select value->>'correctAnswer' from jsonb_array_elements(p_package->'listeningExercises')
      union all select value->>'modelAnswer' from jsonb_array_elements(p_package->'speakingExercises')
      union all select value->>'correctAnswer' from jsonb_array_elements(p_package->'reviewQuestions')
    ), '{}'),
    coalesce(array(
      select value->>'character' from jsonb_array_elements(p_package->'kanji')
      union all select value->>'term' from jsonb_array_elements(p_package->'vocabulary')
      union all select value->>'pattern' from jsonb_array_elements(p_package->'grammar')
    ), '{}'),
    '[
      {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
      {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
      {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
      {"id":"speaking","label":"Speaking","description":"Answer the story questions aloud."},
      {"id":"reading","label":"Reading","description":"Read closely and answer in Japanese."},
      {"id":"listening","label":"Listening","description":"Listen for meaning."},
      {"id":"review","label":"Review","description":"Retrieve the lesson without hints."}
    ]'::jsonb,
    jsonb_build_object(
      'schemaVersion', 3,
      'importSchemaVersion', 1,
      'title', p_package->>'title',
      'japaneseTitle', p_package->>'japaneseTitle',
      'summary', p_package->>'summary',
      'topic', p_package->>'topic',
      'level', v_level,
      'durationMinutes', (p_package->>'durationMinutes')::integer,
      'source', 'admin_created',
      'tags', coalesce(p_package->'tags', '[]'),
      'storyPreview', p_package->>'storyPreview',
      'readingTitle', p_package->>'readingTitle',
      'readingJapaneseTitle', p_package->>'readingJapaneseTitle',
      'targetKanji', v_target_kanji,
      'importedWithoutGenerationApi', true
    ),
    case when p_publish then now() else null end,
    auth.uid()
  );

  for v_line in
    select value, ordinality
    from jsonb_array_elements(p_package->'story') with ordinality
  loop
    insert into public.lesson_story_lines (
      lesson_version_id, position, japanese_text, translation, tappable_terms
    ) values (
      v_version_id, v_line.ordinality,
      v_line.value->>'japanese', v_line.value->>'english',
      coalesce(array(select word->>'surface' from jsonb_array_elements(v_line.value->'words') word), '{}')
    ) returning id into v_story_line_id;

    for v_word in
      select value, ordinality
      from jsonb_array_elements(v_line.value->'words') with ordinality
    loop
      select record.id into v_library_id
      from public.vocabulary_records record
      where record.written_form = v_word.value->>'surface'
        and record.reading = v_word.value->>'reading'
        and record.meaning = v_word.value->>'meaning'
        and record.archived_at is null
      limit 1;
      v_library_type := 'vocabulary';
      if v_library_id is null then
        select record.id into v_library_id
        from public.kanji_records record
        where record.character = v_word.value->>'surface'
          and record.archived_at is null
        limit 1;
        v_library_type := case when v_library_id is null then null else 'kanji' end;
      end if;

      insert into public.lesson_story_words (
        lesson_version_id, story_line_id, position, surface, reading, meaning,
        script_type, library_id, library_type
      ) values (
        v_version_id, v_story_line_id, v_word.ordinality,
        v_word.value->>'surface', v_word.value->>'reading', v_word.value->>'meaning',
        v_word.value->>'scriptType', v_library_id, v_library_type
      );
    end loop;
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'vocabulary') with ordinality
  loop
    select id into v_library_id
    from public.vocabulary_records
    where written_form = v_item.value->>'term'
      and reading = v_item.value->>'reading'
      and meaning = v_item.value->>'meaning'
      and archived_at is null
    limit 1;
    insert into public.lesson_vocabulary (
      lesson_version_id, position, vocabulary_id, written_form, reading,
      meaning, part_of_speech, example_sentence
    ) values (
      v_version_id, v_item.ordinality, v_library_id,
      v_item.value->>'term', v_item.value->>'reading', v_item.value->>'meaning',
      v_item.value->>'partOfSpeech', v_item.value->>'exampleSentence'
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'grammar') with ordinality
  loop
    select id into v_library_id
    from public.grammar_records
    where pattern = v_item.value->>'pattern' and jlpt_level = v_level and archived_at is null
    limit 1;
    insert into public.lesson_grammar (
      lesson_version_id, position, grammar_id, pattern, meaning, structure,
      usage_notes, example, translation, common_mistake
    ) values (
      v_version_id, v_item.ordinality, v_library_id,
      v_item.value->>'pattern', v_item.value->>'meaning', v_item.value->>'structure',
      v_item.value->>'usage', v_item.value->>'example', v_item.value->>'translation',
      coalesce(v_item.value->>'commonMistake', '')
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'vocabularyQuestions') with ordinality
  loop
    v_text := concat_ws(' ', v_item.value->>'prompt', v_item.value->>'cue', array_to_string(array(select jsonb_array_elements_text(v_item.value->'choices')), ' '));
    insert into public.lesson_practice_activities (
      lesson_version_id, position, phase, activity_type, difficulty, mode, skill,
      prompt, cue, choices, correct_answer, accepted_answers, explanation,
      hint_front, hint_back, target_item_ids, inspectable_terms
    ) values (
      v_version_id, v_item.ordinality, 'vocabulary', 'multiple_choice',
      v_item.value->>'difficulty', v_item.value->>'mode', 'understanding',
      v_item.value->>'prompt', coalesce(v_item.value->>'cue', ''),
      array(select jsonb_array_elements_text(v_item.value->'choices')),
      v_item.value->>'correctAnswer',
      coalesce(array(select jsonb_array_elements_text(v_item.value->'acceptedAnswers')), array[v_item.value->>'correctAnswer']),
      v_item.value->>'explanation', '', '',
      public.resolve_admin_lesson_target_ids(v_level, v_item.value->'targetRefs'),
      public.build_admin_lesson_inspectable_terms(v_level, v_text, p_package->'vocabulary', p_package->'kanji')
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'grammarQuestions') with ordinality
  loop
    v_text := concat_ws(' ', v_item.value->>'prompt', v_item.value->>'cue', array_to_string(array(select jsonb_array_elements_text(coalesce(v_item.value->'choices', '[]'))), ' '));
    insert into public.lesson_practice_activities (
      lesson_version_id, position, phase, activity_type, difficulty, mode, skill,
      prompt, cue, choices, correct_answer, accepted_answers, explanation,
      hint_front, hint_back, target_item_ids, inspectable_terms
    ) values (
      v_version_id, v_item.ordinality, 'grammar',
      case v_item.value->>'type'
        when 'sentence-order' then 'word_order'
        when 'natural-sentence' then 'text_input'
        else 'multiple_choice'
      end,
      v_item.value->>'difficulty', 'grammar', v_item.value->>'skill',
      v_item.value->>'prompt', coalesce(v_item.value->>'cue', ''),
      coalesce(array(select jsonb_array_elements_text(v_item.value->'choices')), '{}'),
      v_item.value->>'correctAnswer',
      coalesce(array(select jsonb_array_elements_text(v_item.value->'acceptedAnswers')), array[v_item.value->>'correctAnswer']),
      v_item.value->>'explanation', coalesce(v_item.value->>'hintFront', ''),
      coalesce(v_item.value->>'hintBack', ''),
      public.resolve_admin_lesson_target_ids(v_level, v_item.value->'targetRefs'),
      public.build_admin_lesson_inspectable_terms(v_level, v_text, p_package->'vocabulary', p_package->'kanji')
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'speakingExercises') with ordinality
  loop
    insert into public.lesson_speaking_activities (
      lesson_version_id, position, mode, question_type, prompt, easy_prompt,
      medium_prompt, hard_prompt, expected_answer, model_answer,
      expected_concepts, semantic_criteria, inspectable_terms, target_item_ids
    ) values (
      v_version_id, v_item.ordinality, v_item.value->>'mode',
      v_item.value->>'questionType', v_item.value->>'prompt',
      case when v_item.value->>'mode' = 'easy' then v_item.value->>'prompt' else null end,
      case when v_item.value->>'mode' = 'medium' then v_item.value->>'prompt' else null end,
      case when v_item.value->>'mode' = 'hard' then v_item.value->>'prompt' else null end,
      coalesce(v_item.value->>'expectedAnswer', v_item.value->>'modelAnswer'),
      v_item.value->>'modelAnswer',
      array(select jsonb_array_elements_text(v_item.value->'expectedConcepts')),
      array(select jsonb_array_elements_text(v_item.value->'semanticCriteria')),
      public.build_admin_lesson_inspectable_terms(v_level, v_item.value->>'prompt', p_package->'vocabulary', p_package->'kanji'),
      public.resolve_admin_lesson_target_ids(v_level, v_item.value->'targetRefs')
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'readingConversation') with ordinality
  loop
    insert into public.lesson_reading_sections (
      lesson_version_id, position, speaker, japanese_text, translation,
      tappable_terms, inspectable_terms, target_item_ids
    ) values (
      v_version_id, v_item.ordinality, coalesce(v_item.value->>'speaker', 'Narrator'),
      v_item.value->>'japanese', v_item.value->>'english',
      array(select term->>'surface' from jsonb_array_elements(public.build_admin_lesson_inspectable_terms(v_level, v_item.value->>'japanese', p_package->'vocabulary', p_package->'kanji')) term),
      public.build_admin_lesson_inspectable_terms(v_level, v_item.value->>'japanese', p_package->'vocabulary', p_package->'kanji'),
      '{}'
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'readingQuestions') with ordinality
  loop
    insert into public.lesson_reading_questions (
      lesson_version_id, position, difficulty, question, answer
    ) values (
      v_version_id, v_item.ordinality, v_item.value->>'difficulty',
      v_item.value->>'question', v_item.value->>'answer'
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'listeningExercises') with ordinality
  loop
    v_text := concat_ws(' ', v_item.value->>'prompt', array_to_string(array(select jsonb_array_elements_text(v_item.value->'conversationLines')), ' '), array_to_string(array(select jsonb_array_elements_text(v_item.value->'choices')), ' '));
    insert into public.lesson_listening_activities (
      lesson_version_id, position, difficulty, prompt, transcript,
      conversation_lines, choices, correct_answer, explanation,
      inspectable_terms, target_item_ids
    ) values (
      v_version_id, v_item.ordinality, lower(v_item.value->>'difficulty'),
      v_item.value->>'prompt', v_item.value->>'transcript',
      array(select jsonb_array_elements_text(v_item.value->'conversationLines')),
      array(select jsonb_array_elements_text(v_item.value->'choices')),
      v_item.value->>'correctAnswer', v_item.value->>'explanation',
      public.build_admin_lesson_inspectable_terms(v_level, v_text, p_package->'vocabulary', p_package->'kanji'),
      public.resolve_admin_lesson_target_ids(v_level, v_item.value->'targetRefs')
    );
  end loop;

  for v_item in
    select value, ordinality from jsonb_array_elements(p_package->'reviewQuestions') with ordinality
  loop
    insert into public.lesson_review_activities (
      lesson_version_id, position, question_type, category, prompt, choices,
      correct_answer, explanation, target_item_ids
    ) values (
      v_version_id, v_item.ordinality,
      coalesce(v_item.value->>'questionType', 'multiple-choice'),
      v_item.value->>'category', v_item.value->>'prompt',
      array(select jsonb_array_elements_text(v_item.value->'choices')),
      v_item.value->>'correctAnswer', v_item.value->>'explanation',
      public.resolve_admin_lesson_target_ids(v_level, v_item.value->'targetRefs')
    );
  end loop;

  if p_publish then
    update public.lessons
    set current_version_id = v_version_id,
        status = 'published', published_at = now(), archived_at = null,
        updated_by = auth.uid(), updated_at = now()
    where id = v_lesson.id;
  end if;

  insert into public.lesson_validation_runs (
    lesson_id, lesson_version_id, status, score, warnings, completed_at
  ) values (
    v_lesson.id, v_version_id, 'passed', 100, '{}', now()
  );

  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, after_summary, metadata
  ) values (
    auth.uid(), 'lesson.complete_imported', 'lesson', v_lesson.id::text,
    jsonb_build_object('lesson_version_id', v_version_id, 'version_number', v_version_number, 'published', p_publish),
    jsonb_build_object('legacy_id', p_package->>'id', 'model_api_used', false)
  );

  return jsonb_build_object(
    'lesson_id', v_lesson.id,
    'lesson_ref', p_package->>'id',
    'lesson_version_id', v_version_id,
    'version_number', v_version_number,
    'status', v_status,
    'published', p_publish,
    'model_api_used', false
  );
end
$$;

revoke all on function public.resolve_admin_lesson_target_ids(public.jlpt_level, jsonb) from public;
revoke all on function public.build_admin_lesson_inspectable_terms(public.jlpt_level, text, jsonb, jsonb) from public;
revoke all on function public.import_complete_lesson(jsonb, boolean) from public;
grant execute on function public.import_complete_lesson(jsonb, boolean) to authenticated;

comment on function public.import_complete_lesson(jsonb, boolean) is
  'Transactionally imports a complete staff-authored lesson without a generation API call.';
