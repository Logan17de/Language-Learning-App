alter table public.lesson_versions
  add column metadata jsonb not null default '{}'::jsonb
  check (jsonb_typeof(metadata) = 'object');

create or replace function public.save_lesson_draft(p_lesson_ref text, p_package jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_version_number integer;
  v_item record;
  v_slug text;
begin
  if not public.has_app_role(array['admin','content_editor']::public.app_role[]) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_package) <> 'object'
     or nullif(p_package->>'title', '') is null
     or jsonb_array_length(coalesce(p_package->'phases', '[]'::jsonb)) <> 7 then
    raise exception 'Invalid lesson package' using errcode = '22023';
  end if;

  select * into v_lesson from public.lessons
    where id::text = p_lesson_ref or legacy_id = p_lesson_ref
    limit 1 for update;

  if not found then
    v_slug := trim(both '-' from lower(regexp_replace(p_package->>'title', '[^a-zA-Z0-9]+', '-', 'g')));
    insert into public.lessons (
      legacy_id, slug, title, japanese_title, summary, topic, jlpt_level, duration_minutes,
      status, source, tags, created_by, updated_by
    ) values (
      coalesce(nullif(p_package->>'id', ''), 'lesson_' || gen_random_uuid()::text),
      v_slug || '-' || left(gen_random_uuid()::text, 8),
      p_package->>'title', coalesce(p_package->>'japaneseTitle', p_package->>'title'),
      coalesce(p_package->>'summary', ''), coalesce(p_package->>'topic', 'General'),
      coalesce(p_package->>'level', 'N5')::public.jlpt_level,
      greatest(5, least(120, coalesce((p_package->>'durationMinutes')::integer, 30))),
      'draft', 'admin_created',
      coalesce(array(select jsonb_array_elements_text(p_package->'tags')), '{}'),
      auth.uid(), auth.uid()
    ) returning * into v_lesson;
  end if;

  update public.lesson_versions
    set status = 'archived'
    where lesson_id = v_lesson.id and status in ('draft','generated','checking','needs_review','approved');
  select coalesce(max(version_number), 0) + 1 into v_version_number
    from public.lesson_versions where lesson_id = v_lesson.id;

  insert into public.lesson_versions (
    id, lesson_id, version_number, status, change_summary, schema_version,
    answer_keys, review_items, phases, metadata, created_by
  ) values (
    v_version_id, v_lesson.id, v_version_number, 'draft', 'Admin draft saved', 1,
    coalesce(array(select jsonb_array_elements_text(p_package->'answerKeys')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_package->'reviewItems')), '{}'),
    coalesce(p_package->'phases', '[]'::jsonb),
    jsonb_build_object(
      'title', p_package->>'title',
      'japaneseTitle', p_package->>'japaneseTitle',
      'summary', p_package->>'summary',
      'topic', p_package->>'topic',
      'level', p_package->>'level',
      'durationMinutes', p_package->'durationMinutes',
      'source', p_package->>'source',
      'tags', coalesce(p_package->'tags', '[]'::jsonb),
      'storyPreview', p_package->>'storyPreview'
    ),
    auth.uid()
  );

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'story', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_story_lines (lesson_version_id, position, japanese_text, translation, tappable_terms)
    values (
      v_version_id, v_item.ordinality, v_item.value->>'japanese', v_item.value->>'english',
      coalesce(array(select jsonb_array_elements_text(v_item.value->'tappableTerms')), '{}')
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'vocabulary', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_vocabulary (
      lesson_version_id, position, written_form, reading, meaning, part_of_speech, example_sentence
    ) values (
      v_version_id, v_item.ordinality, v_item.value->>'term', v_item.value->>'reading',
      v_item.value->>'meaning', coalesce(v_item.value->>'partOfSpeech', 'other'),
      v_item.value->>'exampleSentence'
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'grammar', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_grammar (
      lesson_version_id, position, pattern, meaning, structure, usage_notes, example, translation, common_mistake
    ) values (
      v_version_id, v_item.ordinality, v_item.value->>'pattern', v_item.value->>'meaning',
      v_item.value->>'structure', coalesce(v_item.value->>'usage', ''),
      coalesce(v_item.value->>'example', ''), coalesce(v_item.value->>'translation', ''),
      coalesce(v_item.value->>'commonMistake', '')
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'readingConversation', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_reading_sections (lesson_version_id, position, speaker, japanese_text, translation)
    values (
      v_version_id, v_item.ordinality, v_item.value->>'speaker',
      v_item.value->>'japanese', v_item.value->>'english'
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'listeningExercises', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_listening_activities (
      lesson_version_id, position, prompt, transcript, choices, correct_answer, explanation
    ) values (
      v_version_id, v_item.ordinality, v_item.value->>'prompt',
      coalesce(v_item.value->>'transcript', ''),
      coalesce(array(select jsonb_array_elements_text(v_item.value->'choices')), '{}'),
      v_item.value->>'correctAnswer', coalesce(v_item.value->>'explanation', '')
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'speakingExercises', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_speaking_activities (
      lesson_version_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer
    ) values (
      v_version_id, v_item.ordinality, coalesce(v_item.value->>'mode', 'medium'),
      v_item.value->>'prompt', v_item.value->>'easyPrompt', v_item.value->>'mediumPrompt',
      v_item.value->>'hardPrompt', v_item.value->>'expectedAnswer', v_item.value->>'modelAnswer'
    );
  end loop;

  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'reviewQuestions', '[]'::jsonb)) with ordinality
  loop
    insert into public.lesson_review_activities (
      lesson_version_id, position, question_type, category, prompt, choices, correct_answer, explanation
    ) values (
      v_version_id, v_item.ordinality, coalesce(v_item.value->>'questionType', 'multiple-choice'),
      'mixed', v_item.value->>'prompt',
      coalesce(array(select jsonb_array_elements_text(v_item.value->'choices')), '{}'),
      v_item.value->>'correctAnswer', coalesce(v_item.value->>'explanation', '')
    );
  end loop;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, after_summary, metadata)
  values (
    auth.uid(), 'lesson.draft_saved', 'lesson', v_lesson.id::text,
    jsonb_build_object('lesson_version_id', v_version_id, 'version_number', v_version_number),
    jsonb_build_object('legacy_id', v_lesson.legacy_id)
  );
  return jsonb_build_object(
    'lesson_id', v_lesson.id, 'lesson_version_id', v_version_id,
    'version_number', v_version_number, 'status', 'draft'
  );
end
$$;

create or replace function public.publish_lesson_version(p_lesson_id uuid, p_change_summary text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons%rowtype;
  v_source public.lesson_versions%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_number integer;
begin
  if not public.has_app_role(array['admin','content_editor']::public.app_role[]) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found then raise exception 'Lesson not found' using errcode = 'P0002'; end if;
  select * into v_source from public.lesson_versions
    where lesson_id = p_lesson_id and status in ('draft','generated','checking','needs_review','approved')
    order by version_number desc limit 1;
  if not found and v_lesson.current_version_id is not null then
    select * into v_source from public.lesson_versions where id = v_lesson.current_version_id;
  end if;
  if not found then raise exception 'Source version not found' using errcode = 'P0002'; end if;
  select coalesce(max(version_number), 0) + 1 into v_number from public.lesson_versions where lesson_id = p_lesson_id;
  insert into public.lesson_versions (
    id, lesson_id, version_number, status, change_summary, schema_version,
    answer_keys, review_items, phases, metadata, published_at, created_by
  ) values (
    v_new_id, p_lesson_id, v_number, 'published', p_change_summary, v_source.schema_version,
    v_source.answer_keys, v_source.review_items, v_source.phases, v_source.metadata, now(), auth.uid()
  );
  insert into public.lesson_story_lines (lesson_version_id, position, japanese_text, translation, tappable_terms, image_asset_id, audio_asset_id)
    select v_new_id, position, japanese_text, translation, tappable_terms, image_asset_id, audio_asset_id from public.lesson_story_lines where lesson_version_id = v_source.id;
  insert into public.lesson_vocabulary (lesson_version_id, position, vocabulary_id, written_form, reading, meaning, part_of_speech, example_sentence)
    select v_new_id, position, vocabulary_id, written_form, reading, meaning, part_of_speech, example_sentence from public.lesson_vocabulary where lesson_version_id = v_source.id;
  insert into public.lesson_grammar (lesson_version_id, position, grammar_id, pattern, meaning, structure, usage_notes, example, translation, common_mistake)
    select v_new_id, position, grammar_id, pattern, meaning, structure, usage_notes, example, translation, common_mistake from public.lesson_grammar where lesson_version_id = v_source.id;
  insert into public.lesson_reading_sections (lesson_version_id, position, speaker, japanese_text, translation, tappable_terms)
    select v_new_id, position, speaker, japanese_text, translation, tappable_terms from public.lesson_reading_sections where lesson_version_id = v_source.id;
  insert into public.lesson_listening_activities (lesson_version_id, position, prompt, transcript, choices, correct_answer, explanation, audio_asset_id)
    select v_new_id, position, prompt, transcript, choices, correct_answer, explanation, audio_asset_id from public.lesson_listening_activities where lesson_version_id = v_source.id;
  insert into public.lesson_speaking_activities (lesson_version_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer)
    select v_new_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer from public.lesson_speaking_activities where lesson_version_id = v_source.id;
  insert into public.lesson_review_activities (lesson_version_id, position, question_type, category, prompt, choices, correct_answer, explanation)
    select v_new_id, position, question_type, category, prompt, choices, correct_answer, explanation from public.lesson_review_activities where lesson_version_id = v_source.id;
  update public.lesson_versions set status = 'archived'
    where id = v_source.id and v_source.status <> 'published';
  update public.lessons set
    title = coalesce(nullif(v_source.metadata->>'title', ''), title),
    japanese_title = coalesce(nullif(v_source.metadata->>'japaneseTitle', ''), japanese_title),
    summary = coalesce(v_source.metadata->>'summary', summary),
    topic = coalesce(nullif(v_source.metadata->>'topic', ''), topic),
    jlpt_level = coalesce(nullif(v_source.metadata->>'level', '')::public.jlpt_level, jlpt_level),
    duration_minutes = coalesce((v_source.metadata->>'durationMinutes')::integer, duration_minutes),
    tags = coalesce(array(select jsonb_array_elements_text(v_source.metadata->'tags')), tags),
    current_version_id = v_new_id,
    status = 'published',
    published_at = now(),
    archived_at = null,
    updated_by = auth.uid()
    where id = p_lesson_id;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before_summary, after_summary, metadata)
  values (
    auth.uid(), 'lesson.published', 'lesson', p_lesson_id::text,
    jsonb_build_object('lesson_version_id', v_lesson.current_version_id),
    jsonb_build_object('lesson_version_id', v_new_id, 'version_number', v_number),
    jsonb_build_object('change_summary', p_change_summary)
  );
  return jsonb_build_object('lesson_id', p_lesson_id, 'lesson_version_id', v_new_id, 'version_number', v_number, 'status', 'published');
end
$$;

revoke all on function public.save_lesson_draft(text, jsonb) from public;
grant execute on function public.save_lesson_draft(text, jsonb) to authenticated;
