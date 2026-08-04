-- Store the five story-grounded speaking questions and move Speaking between
-- Grammar and Reading in every newly generated canonical lesson.

alter table public.lesson_speaking_activities
  add column question_type text not null default 'direct_information'
    check (question_type in (
      'direct_information',
      'sequence_of_events',
      'speaker_intention',
      'reason_or_purpose',
      'simple_inference'
    )),
  add column expected_concepts text[] not null default '{}',
  add column semantic_criteria text[] not null default '{}';

alter function public.store_generated_lesson_package_background(uuid, jsonb, integer)
  rename to store_generated_lesson_package_background_listening_base;

create or replace function public.store_generated_lesson_package_background(
  p_request_id uuid,
  p_package jsonb,
  p_generation_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_version_id uuid;
  v_item record;
  v_easy integer;
  v_medium integer;
  v_hard integer;
  v_type_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') <> 5 then
    raise exception 'Invalid speaking question bank' using errcode = '22023';
  end if;

  select
    count(*) filter (where value->>'mode' = 'easy'),
    count(*) filter (where value->>'mode' = 'medium'),
    count(*) filter (where value->>'mode' = 'hard'),
    count(distinct value->>'questionType')
  into v_easy, v_medium, v_hard, v_type_count
  from jsonb_array_elements(p_package->'speakingExercises');

  if v_easy <> 2 or v_medium <> 2 or v_hard <> 1 or v_type_count <> 5 then
    raise exception 'Speaking requires two easy, two medium, one hard, and five unique types'
      using errcode = '22023';
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'speakingExercises') with ordinality
  loop
    if v_item.value->>'questionType' not in (
         'direct_information',
         'sequence_of_events',
         'speaker_intention',
         'reason_or_purpose',
         'simple_inference'
       )
       or jsonb_typeof(v_item.value->'expectedConcepts') <> 'array'
       or jsonb_typeof(v_item.value->'semanticCriteria') <> 'array'
       or btrim(coalesce(v_item.value->>'prompt', '')) = ''
       or btrim(coalesce(v_item.value->>'modelAnswer', '')) = '' then
      raise exception 'Invalid speaking question at position %', v_item.ordinality
        using errcode = '22023';
    end if;

    if jsonb_array_length(v_item.value->'expectedConcepts') not between 1 and 6
       or jsonb_array_length(v_item.value->'semanticCriteria') not between 1 and 6 then
      raise exception 'Invalid speaking concepts at position %', v_item.ordinality
        using errcode = '22023';
    end if;
  end loop;

  v_result := public.store_generated_lesson_package_background_listening_base(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
  v_version_id := (v_result->>'lesson_version_id')::uuid;

  if v_version_id is null then
    raise exception 'Stored lesson version was not returned' using errcode = '22023';
  end if;

  if coalesce((v_result->>'reused')::boolean, false) then
    return v_result;
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'speakingExercises') with ordinality
  loop
    update public.lesson_speaking_activities
    set question_type = v_item.value->>'questionType',
        expected_concepts = array(
          select concept
          from jsonb_array_elements_text(v_item.value->'expectedConcepts')
            as concepts(concept)
        ),
        semantic_criteria = array(
          select criterion
          from jsonb_array_elements_text(v_item.value->'semanticCriteria')
            as criteria(criterion)
        ),
        updated_at = now()
    where lesson_version_id = v_version_id
      and position = v_item.ordinality;
  end loop;

  update public.lesson_versions
  set phases = '[
    {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
    {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
    {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
    {"id":"speaking","label":"Speaking","description":"Answer the story questions aloud."},
    {"id":"reading","label":"Reading","description":"Read closely and answer in Japanese."},
    {"id":"listening","label":"Listening","description":"Listen for meaning."},
    {"id":"review","label":"Review","description":"Retrieve the lesson without hints."}
  ]'::jsonb,
      updated_at = now()
  where id = v_version_id;

  return v_result;
end
$$;

revoke all on function public.store_generated_lesson_package_background_listening_base(
  uuid, jsonb, integer
) from public;
revoke all on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) from public;
grant execute on function public.store_generated_lesson_package_background_listening_base(
  uuid, jsonb, integer
) to service_role;
grant execute on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) to service_role;

comment on column public.lesson_speaking_activities.question_type is
  'The story-comprehension speaking skill tested by this question.';
comment on column public.lesson_speaking_activities.expected_concepts is
  'Meaning units accepted by semantic speaking evaluation.';
comment on column public.lesson_speaking_activities.semantic_criteria is
  'Evaluation rules that accept equivalent Japanese wording.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Stores generated lessons with strict reading, listening, and speaking banks.';
