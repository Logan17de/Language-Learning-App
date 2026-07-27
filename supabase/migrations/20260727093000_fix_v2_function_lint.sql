-- Correct PL/pgSQL row-variable typing found by linked database lint.
-- This migration is incremental because the original V2 migrations may already
-- be recorded in remote migration history.

create or replace function public.begin_custom_lesson_generation_v3(
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
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
  v_normalized_topic text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_profile
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
    where user_id = auth.uid()
      and created_at >= current_date
      and status <> 'failed'
  ) >= 5 then
    raise exception 'Daily custom lesson limit reached' using errcode = '54000';
  end if;

  v_normalized_topic := public.normalize_lesson_topic(p_topic);

  select candidate.*
  into v_lesson
  from public.lessons candidate
  where candidate.status = 'published'
    and candidate.archived_at is null
    and candidate.current_version_id is not null
    and candidate.reusable
    and candidate.generated_for_user_id is null
    and candidate.jlpt_level = p_level
    and not exists (
      select 1
      from public.lesson_assignments a
      where a.user_id = auth.uid() and a.lesson_id = candidate.id
    )
    and not exists (
      select 1
      from public.lesson_completions c
      where c.user_id = auth.uid() and c.lesson_id = candidate.id
    )
    and (
      candidate.normalized_topic = v_normalized_topic
      or (
        least(
          char_length(candidate.normalized_topic),
          char_length(v_normalized_topic)
        ) >= 4
        and (
          position(candidate.normalized_topic in v_normalized_topic) > 0
          or position(v_normalized_topic in candidate.normalized_topic) > 0
        )
      )
      or exists (
        select 1
        from regexp_split_to_table(candidate.normalized_topic, '[^[:alnum:]]+') candidate_token
        join regexp_split_to_table(v_normalized_topic, '[^[:alnum:]]+') request_token
          on candidate_token = request_token
        where char_length(candidate_token) >= 3
      )
      or exists (
        select 1
        from unnest(candidate.tags) tag
        where v_normalized_topic like '%' || lower(tag) || '%'
           or lower(tag) like '%' || v_normalized_topic || '%'
      )
    )
  order by
    case
      when candidate.normalized_topic = v_normalized_topic then 0
      when (
        least(
          char_length(candidate.normalized_topic),
          char_length(v_normalized_topic)
        ) >= 4
        and (
          position(candidate.normalized_topic in v_normalized_topic) > 0
          or position(v_normalized_topic in candidate.normalized_topic) > 0
        )
      ) then 1
      else 2
    end,
    candidate.usage_count asc,
    candidate.published_at desc nulls last
  limit 1;

  insert into public.custom_lesson_requests (
    user_id,
    topic,
    jlpt_level,
    duration_minutes,
    focus,
    speaking_difficulty,
    note,
    status,
    generated_lesson_id
  ) values (
    auth.uid(),
    trim(p_topic),
    p_level,
    30,
    'balanced',
    'medium',
    '',
    (case when v_lesson.id is null then 'generation_pending' else 'approved' end)::public.custom_request_status,
    v_lesson.id
  )
  returning * into v_request;

  if v_lesson.id is not null then
    insert into public.lesson_assignments (
      user_id,
      lesson_id,
      lesson_version_id,
      selection_mode,
      algorithm_version,
      interest_matches
    ) values (
      auth.uid(),
      v_lesson.id,
      v_lesson.current_version_id,
      'pro_custom',
      'custom-reuse-v2',
      '{}'
    )
    returning * into v_assignment;

    update public.lessons
    set usage_count = usage_count + 1,
        last_assigned_at = now(),
        updated_at = now()
    where id = v_lesson.id;

    return jsonb_build_object(
      'request_id', v_request.id,
      'job_id', null,
      'level', p_level,
      'interests', to_jsonb(v_profile.interests),
      'reused', true,
      'lesson_id', v_lesson.id,
      'lesson_version_id', v_lesson.current_version_id,
      'assignment_id', v_assignment.id
    );
  end if;

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
    'interests', to_jsonb(v_profile.interests),
    'reused', false,
    'lesson_id', null
  );
end
$$;

create or replace function public.store_generated_lesson_package_v2(
  p_request_id uuid,
  p_package jsonb,
  p_generation_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_request public.custom_lesson_requests%rowtype;
  v_existing public.lessons%rowtype;
  v_lesson public.lessons%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_assignment public.lesson_assignments%rowtype;
  v_line record;
  v_word record;
  v_item record;
  v_story_line_id uuid;
  v_library_id uuid;
  v_library_type text;
  v_signature text;
  v_slug text;
  v_phases jsonb := '[
    {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
    {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
    {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
    {"id":"reading","label":"Reading","description":"Read a connected conversation."},
    {"id":"listening","label":"Listening","description":"Listen for meaning."},
    {"id":"speaking","label":"Speaking","description":"Produce natural Japanese."},
    {"id":"review","label":"Review","description":"Retrieve the lesson without hints."}
  ]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_request
  from public.custom_lesson_requests
  where id = p_request_id
    and user_id = auth.uid()
    and status = 'generation_pending'
  for update;

  if not found then
    raise exception 'Generation request unavailable' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package) <> 'object'
     or coalesce((p_package->>'schemaVersion')::integer, 0) <> 2
     or length(trim(coalesce(p_package->>'title', ''))) < 1
     or length(trim(coalesce(p_package->>'japaneseTitle', ''))) < 1
     or length(trim(coalesce(p_package->>'summary', ''))) < 1
     or jsonb_typeof(p_package->'story') <> 'array'
     or jsonb_array_length(p_package->'story') not between 10 and 20
     or jsonb_typeof(p_package->'kanji') <> 'array'
     or jsonb_array_length(p_package->'kanji') <> 5
     or jsonb_typeof(p_package->'vocabulary') <> 'array'
     or jsonb_array_length(p_package->'vocabulary') not between 8 and 40
     or jsonb_typeof(p_package->'grammar') <> 'array'
     or jsonb_array_length(p_package->'grammar') <> 3
     or jsonb_typeof(p_package->'vocabularyQuestions') <> 'array'
     or jsonb_array_length(p_package->'vocabularyQuestions') <> 10
     or jsonb_typeof(p_package->'grammarQuestions') <> 'array'
     or jsonb_array_length(p_package->'grammarQuestions') <> 10
     or jsonb_typeof(p_package->'readingConversation') <> 'array'
     or jsonb_array_length(p_package->'readingConversation') not between 4 and 8
     or jsonb_typeof(p_package->'listeningExercises') <> 'array'
     or jsonb_array_length(p_package->'listeningExercises') not between 1 and 5
     or jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') not between 1 and 5
     or jsonb_typeof(p_package->'reviewQuestions') <> 'array'
     or jsonb_array_length(p_package->'reviewQuestions') <> 5 then
    raise exception 'Invalid playable lesson package' using errcode = '22023';
  end if;

  -- Generation audit fields do not make otherwise identical content unique.
  v_signature := encode(
    digest((p_package - 'generationAudit')::text, 'sha256'),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(v_signature, 0));

  select *
  into v_existing
  from public.lessons existing
  where existing.jlpt_level = v_request.jlpt_level
    and existing.content_signature = v_signature
    and existing.reusable
    and existing.status = 'published'
    and existing.archived_at is null
    and existing.current_version_id is not null
  limit 1;

  if v_existing.id is not null then
    if exists (
      select 1
      from public.lesson_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.lesson_id = v_existing.id
    ) or exists (
      select 1
      from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = v_existing.id
    ) then
      raise exception 'Generated lesson repeats content already seen by this learner'
        using errcode = '23505';
    end if;

    insert into public.lesson_assignments (
      user_id,
      lesson_id,
      lesson_version_id,
      selection_mode,
      algorithm_version,
      interest_matches
    ) values (
      auth.uid(),
      v_existing.id,
      v_existing.current_version_id,
      'pro_custom',
      'custom-signature-reuse-v2',
      '{}'
    )
    returning * into v_assignment;

    update public.lessons
    set usage_count = usage_count + 1,
        last_assigned_at = now(),
        updated_at = now()
    where id = v_existing.id;

    update public.custom_lesson_requests
    set status = 'approved',
        matched_lesson_id = v_existing.id,
        generated_lesson_id = v_existing.id,
        updated_at = now()
    where id = v_request.id;

    update public.generated_lesson_jobs
    set status = 'completed',
        lesson_id = v_existing.id,
        source_lesson_id = v_existing.id,
        generation_seconds = greatest(0, p_generation_seconds),
        updated_at = now()
    where custom_lesson_request_id = v_request.id;

    return jsonb_build_object(
      'lesson_id', v_existing.id,
      'lesson_version_id', v_existing.current_version_id,
      'assignment_id', v_assignment.id,
      'status', 'published',
      'reused', true
    );
  end if;

  -- Every reference must resolve to an active shared-library record.
  for v_item in select value from jsonb_array_elements(p_package->'kanji')
  loop
    if not exists (
      select 1
      from public.kanji_records record
      where record.id::text = v_item.value->>'libraryId'
        and record.archived_at is null
        and record.quality_status <> 'rejected'
    ) then
      raise exception 'Lesson references unknown kanji' using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_package->'vocabulary')
  loop
    if not exists (
      select 1
      from public.vocabulary_records record
      where record.id::text = v_item.value->>'libraryId'
        and record.archived_at is null
        and record.quality_status <> 'rejected'
    ) then
      raise exception 'Lesson references unknown vocabulary' using errcode = '22023';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_package->'grammar')
  loop
    if not exists (
      select 1
      from public.grammar_records record
      where record.id::text = v_item.value->>'libraryId'
        and record.archived_at is null
        and record.quality_status <> 'rejected'
    ) then
      raise exception 'Lesson references unknown grammar' using errcode = '22023';
    end if;
  end loop;

  v_slug := trim(
    both '-'
    from lower(regexp_replace(p_package->>'title', '[^a-zA-Z0-9]+', '-', 'g'))
  );

  insert into public.lessons (
    legacy_id,
    slug,
    title,
    japanese_title,
    summary,
    topic,
    normalized_topic,
    jlpt_level,
    duration_minutes,
    status,
    source,
    tags,
    published_at,
    generated_for_user_id,
    content_signature,
    reusable,
    usage_count,
    last_assigned_at,
    created_by,
    updated_by
  ) values (
    'lesson_generated_' || gen_random_uuid()::text,
    coalesce(nullif(v_slug, ''), 'generated-lesson')
      || '-' || left(gen_random_uuid()::text, 8),
    left(trim(p_package->>'title'), 180),
    left(trim(p_package->>'japaneseTitle'), 180),
    left(trim(p_package->>'summary'), 1000),
    v_request.topic,
    public.normalize_lesson_topic(v_request.topic),
    v_request.jlpt_level,
    30,
    'published',
    'generated',
    coalesce(
      array(
        select left(value, 60)
        from jsonb_array_elements_text(
          coalesce(p_package->'tags', '[]'::jsonb)
        )
        limit 12
      ),
      '{}'
    ),
    now(),
    null,
    v_signature,
    true,
    1,
    now(),
    null,
    null
  )
  returning * into v_lesson;

  insert into public.lesson_versions (
    id,
    lesson_id,
    version_number,
    status,
    change_summary,
    schema_version,
    answer_keys,
    review_items,
    phases,
    metadata,
    published_at,
    created_by
  ) values (
    v_version_id,
    v_lesson.id,
    1,
    'published',
    'Generated playable lesson V2',
    2,
    coalesce(
      array(
        select value->>'correctAnswer'
        from (
          select value
          from jsonb_array_elements(p_package->'vocabularyQuestions')
          union all
          select value
          from jsonb_array_elements(p_package->'grammarQuestions')
          union all
          select value
          from jsonb_array_elements(p_package->'listeningExercises')
          union all
          select value
          from jsonb_array_elements(p_package->'reviewQuestions')
        ) answer_rows
      ),
      '{}'
    ),
    coalesce(
      array(
        select value->>'character'
        from jsonb_array_elements(p_package->'kanji')
        union all
        select value->>'term'
        from jsonb_array_elements(p_package->'vocabulary')
        union all
        select value->>'pattern'
        from jsonb_array_elements(p_package->'grammar')
      ),
      '{}'
    ),
    v_phases,
    jsonb_build_object(
      'schemaVersion', 2,
      'title', p_package->>'title',
      'japaneseTitle', p_package->>'japaneseTitle',
      'summary', p_package->>'summary',
      'topic', v_request.topic,
      'level', v_request.jlpt_level,
      'durationMinutes', 30,
      'source', 'generated',
      'tags', coalesce(p_package->'tags', '[]'::jsonb),
      'storyPreview', p_package->>'storyPreview',
      'targetKanjiIds', (
        select jsonb_agg(value->>'libraryId')
        from jsonb_array_elements(p_package->'kanji')
      ),
      'targetKanji', p_package->'kanji',
      'generationAudit', coalesce(p_package->'generationAudit', '{}'::jsonb)
    ),
    now(),
    null
  );

  for v_line in
    select value, ordinality
    from jsonb_array_elements(p_package->'story') with ordinality
  loop
    if length(trim(coalesce(v_line.value->>'japanese', ''))) < 1
       or length(trim(coalesce(v_line.value->>'english', ''))) < 1
       or jsonb_typeof(v_line.value->'words') <> 'array' then
      raise exception 'Invalid story line' using errcode = '22023';
    end if;

    insert into public.lesson_story_lines (
      lesson_version_id,
      position,
      japanese_text,
      translation,
      tappable_terms
    ) values (
      v_version_id,
      v_line.ordinality,
      v_line.value->>'japanese',
      v_line.value->>'english',
      coalesce(
        array(
          select word->>'surface'
          from jsonb_array_elements(v_line.value->'words') word
        ),
        '{}'
      )
    )
    returning id into v_story_line_id;

    for v_word in
      select value, ordinality
      from jsonb_array_elements(v_line.value->'words') with ordinality
    loop
      v_library_id := (v_word.value->>'libraryId')::uuid;
      v_library_type := coalesce(v_word.value->>'libraryType', 'vocabulary');

      if v_library_type = 'vocabulary' and not exists (
        select 1
        from public.vocabulary_records record
        where record.id = v_library_id
          and record.archived_at is null
          and record.quality_status <> 'rejected'
      ) then
        raise exception 'Story references unknown vocabulary'
          using errcode = '22023';
      elsif v_library_type = 'kanji' and not exists (
        select 1
        from public.kanji_records record
        where record.id = v_library_id
          and record.archived_at is null
          and record.quality_status <> 'rejected'
      ) then
        raise exception 'Story references unknown kanji'
          using errcode = '22023';
      elsif v_library_type not in ('kanji', 'vocabulary') then
        raise exception 'Invalid story library type' using errcode = '22023';
      end if;

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
        v_version_id,
        v_story_line_id,
        v_word.ordinality,
        v_word.value->>'surface',
        v_word.value->>'reading',
        v_word.value->>'meaning',
        v_word.value->>'scriptType',
        v_library_id,
        v_library_type
      );
    end loop;
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'vocabulary') with ordinality
  loop
    insert into public.lesson_vocabulary (
      lesson_version_id,
      position,
      vocabulary_id,
      written_form,
      reading,
      meaning,
      part_of_speech,
      example_sentence
    ) values (
      v_version_id,
      v_item.ordinality,
      (v_item.value->>'libraryId')::uuid,
      v_item.value->>'term',
      v_item.value->>'reading',
      v_item.value->>'meaning',
      v_item.value->>'partOfSpeech',
      v_item.value->>'exampleSentence'
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'grammar') with ordinality
  loop
    insert into public.lesson_grammar (
      lesson_version_id,
      position,
      grammar_id,
      pattern,
      meaning,
      structure,
      usage_notes,
      example,
      translation,
      common_mistake
    ) values (
      v_version_id,
      v_item.ordinality,
      (v_item.value->>'libraryId')::uuid,
      v_item.value->>'pattern',
      v_item.value->>'meaning',
      v_item.value->>'structure',
      v_item.value->>'usage',
      v_item.value->>'example',
      v_item.value->>'translation',
      coalesce(v_item.value->>'commonMistake', '')
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'vocabularyQuestions') with ordinality
  loop
    insert into public.lesson_practice_activities (
      lesson_version_id,
      position,
      phase,
      activity_type,
      difficulty,
      mode,
      skill,
      prompt,
      cue,
      choices,
      correct_answer,
      accepted_answers,
      explanation,
      hint_front,
      hint_back,
      target_item_ids,
      inspectable_terms
    ) values (
      v_version_id,
      v_item.ordinality,
      'vocabulary',
      v_item.value->>'activityType',
      v_item.value->>'difficulty',
      v_item.value->>'mode',
      'understanding',
      v_item.value->>'prompt',
      v_item.value->>'cue',
      coalesce(
        array(select jsonb_array_elements_text(v_item.value->'choices')),
        '{}'
      ),
      v_item.value->>'correctAnswer',
      coalesce(
        array(select jsonb_array_elements_text(v_item.value->'acceptedAnswers')),
        '{}'
      ),
      v_item.value->>'explanation',
      coalesce(v_item.value->>'hintFront', ''),
      coalesce(v_item.value->>'hintBack', ''),
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      ),
      coalesce(v_item.value->'inspectableTerms', '[]'::jsonb)
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'grammarQuestions') with ordinality
  loop
    insert into public.lesson_practice_activities (
      lesson_version_id,
      position,
      phase,
      activity_type,
      difficulty,
      mode,
      skill,
      prompt,
      cue,
      choices,
      correct_answer,
      accepted_answers,
      explanation,
      hint_front,
      hint_back,
      target_item_ids,
      inspectable_terms
    ) values (
      v_version_id,
      v_item.ordinality,
      'grammar',
      v_item.value->>'activityType',
      v_item.value->>'difficulty',
      coalesce(v_item.value->>'mode', 'grammar'),
      v_item.value->>'skill',
      v_item.value->>'prompt',
      v_item.value->>'cue',
      coalesce(
        array(select jsonb_array_elements_text(v_item.value->'choices')),
        '{}'
      ),
      v_item.value->>'correctAnswer',
      coalesce(
        array(select jsonb_array_elements_text(v_item.value->'acceptedAnswers')),
        '{}'
      ),
      v_item.value->>'explanation',
      coalesce(v_item.value->>'hintFront', ''),
      coalesce(v_item.value->>'hintBack', ''),
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      ),
      coalesce(v_item.value->'inspectableTerms', '[]'::jsonb)
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'readingConversation') with ordinality
  loop
    insert into public.lesson_reading_sections (
      lesson_version_id,
      position,
      speaker,
      japanese_text,
      translation,
      tappable_terms,
      inspectable_terms,
      target_item_ids
    ) values (
      v_version_id,
      v_item.ordinality,
      v_item.value->>'speaker',
      v_item.value->>'japanese',
      v_item.value->>'english',
      coalesce(
        array(
          select term->>'surface'
          from jsonb_array_elements(
            coalesce(v_item.value->'inspectableTerms', '[]'::jsonb)
          ) term
        ),
        '{}'
      ),
      coalesce(v_item.value->'inspectableTerms', '[]'::jsonb),
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      )
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'listeningExercises') with ordinality
  loop
    insert into public.lesson_listening_activities (
      lesson_version_id,
      position,
      prompt,
      transcript,
      choices,
      correct_answer,
      explanation,
      inspectable_terms,
      target_item_ids
    ) values (
      v_version_id,
      v_item.ordinality,
      v_item.value->>'prompt',
      v_item.value->>'transcript',
      array(select jsonb_array_elements_text(v_item.value->'choices')),
      v_item.value->>'correctAnswer',
      v_item.value->>'explanation',
      coalesce(v_item.value->'inspectableTerms', '[]'::jsonb),
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      )
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'speakingExercises') with ordinality
  loop
    insert into public.lesson_speaking_activities (
      lesson_version_id,
      position,
      mode,
      prompt,
      easy_prompt,
      medium_prompt,
      hard_prompt,
      expected_answer,
      model_answer,
      inspectable_terms,
      target_item_ids
    ) values (
      v_version_id,
      v_item.ordinality,
      v_item.value->>'mode',
      v_item.value->>'prompt',
      v_item.value->>'easyPrompt',
      v_item.value->>'mediumPrompt',
      v_item.value->>'hardPrompt',
      v_item.value->>'expectedAnswer',
      v_item.value->>'modelAnswer',
      coalesce(v_item.value->'inspectableTerms', '[]'::jsonb),
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      )
    );
  end loop;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'reviewQuestions') with ordinality
  loop
    insert into public.lesson_review_activities (
      lesson_version_id,
      position,
      question_type,
      category,
      prompt,
      choices,
      correct_answer,
      explanation,
      target_item_ids
    ) values (
      v_version_id,
      v_item.ordinality,
      'multiple-choice',
      v_item.value->>'category',
      v_item.value->>'prompt',
      array(select jsonb_array_elements_text(v_item.value->'choices')),
      v_item.value->>'correctAnswer',
      v_item.value->>'explanation',
      coalesce(
        array(
          select value::uuid
          from jsonb_array_elements_text(v_item.value->'targetItemIds')
        ),
        '{}'
      )
    );
  end loop;

  update public.lessons
  set current_version_id = v_version_id,
      updated_at = now()
  where id = v_lesson.id;

  insert into public.lesson_validation_runs (
    lesson_id,
    lesson_version_id,
    status,
    score,
    warnings,
    completed_at
  ) values (
    v_lesson.id,
    v_version_id,
    'passed',
    100,
    '{}',
    now()
  );

  insert into public.lesson_assignments (
    user_id,
    lesson_id,
    lesson_version_id,
    selection_mode,
    algorithm_version,
    interest_matches
  ) values (
    auth.uid(),
    v_lesson.id,
    v_version_id,
    'pro_custom',
    'custom-playable-v2',
    '{}'
  )
  returning * into v_assignment;

  update public.custom_lesson_requests
  set status = 'approved',
      generated_lesson_id = v_lesson.id,
      updated_at = now()
  where id = v_request.id;

  update public.generated_lesson_jobs
  set status = 'completed',
      lesson_id = v_lesson.id,
      generation_seconds = greatest(0, p_generation_seconds),
      updated_at = now()
  where custom_lesson_request_id = v_request.id;

  -- Initialize empty learner records. Evidence, not assignment, raises scores.
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
  )
  select auth.uid(), 'kanji', value->>'libraryId', 0, 0, 0, 0, 0, 0
  from jsonb_array_elements(p_package->'kanji')
  on conflict (user_id, item_type, item_key) do nothing;

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
  )
  select auth.uid(), 'vocabulary', value->>'libraryId', 0, 0, 0, 0, 0, 0
  from jsonb_array_elements(p_package->'vocabulary')
  on conflict (user_id, item_type, item_key) do nothing;

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
  )
  select auth.uid(), 'grammar', value->>'libraryId', 0, 0, 0, 0, 0, 0
  from jsonb_array_elements(p_package->'grammar')
  on conflict (user_id, item_type, item_key) do nothing;

  update public.kanji_records
  set usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
  where id in (
    select (value->>'libraryId')::uuid
    from jsonb_array_elements(p_package->'kanji')
  );

  update public.vocabulary_records
  set usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
  where id in (
    select (value->>'libraryId')::uuid
    from jsonb_array_elements(p_package->'vocabulary')
  );

  update public.grammar_records
  set usage_count = usage_count + 1,
      last_used_at = now(),
      updated_at = now()
  where id in (
    select (value->>'libraryId')::uuid
    from jsonb_array_elements(p_package->'grammar')
  );

  return jsonb_build_object(
    'lesson_id', v_lesson.id,
    'lesson_version_id', v_version_id,
    'assignment_id', v_assignment.id,
    'status', 'published',
    'reused', false
  );
end
$$;