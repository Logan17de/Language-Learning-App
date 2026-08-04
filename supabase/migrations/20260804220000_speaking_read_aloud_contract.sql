-- Speaking is sentence reading, not open-ended story comprehension. Preserve
-- legacy values for already-published lessons while storing all new generated
-- activities as read_aloud targets.

alter table public.lesson_speaking_activities
  drop constraint if exists lesson_speaking_activities_question_type_check;

alter table public.lesson_speaking_activities
  add constraint lesson_speaking_activities_question_type_check
  check (question_type in (
    'read_aloud',
    'direct_information',
    'sequence_of_events',
    'speaker_intention',
    'reason_or_purpose',
    'simple_inference'
  ));

create or replace function public.store_generated_lesson_package_background_package_base(
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
  v_result jsonb;
  v_version_id uuid;
  v_item record;
  v_easy integer;
  v_medium integer;
  v_hard integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') <> 5 then
    raise exception 'Invalid speaking read-aloud bank' using errcode = '22023';
  end if;

  select
    count(*) filter (where value->>'mode' = 'easy'),
    count(*) filter (where value->>'mode' = 'medium'),
    count(*) filter (where value->>'mode' = 'hard')
  into v_easy, v_medium, v_hard
  from jsonb_array_elements(p_package->'speakingExercises');

  if v_easy <> 2 or v_medium <> 2 or v_hard <> 1 then
    raise exception 'Speaking requires two easy, two medium, and one hard read-aloud sentence'
      using errcode = '22023';
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'speakingExercises') with ordinality
  loop
    if v_item.value->>'questionType' <> 'read_aloud'
       or btrim(coalesce(v_item.value->>'prompt', '')) = ''
       or btrim(coalesce(v_item.value->>'modelAnswer', '')) = '' then
      raise exception 'Invalid speaking read-aloud sentence at position %', v_item.ordinality
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
    set question_type = 'read_aloud',
        expected_concepts = array(
          select concept
          from jsonb_array_elements_text(
            coalesce(v_item.value->'expectedConcepts', '[]'::jsonb)
          ) as concepts(concept)
        ),
        semantic_criteria = array(
          select criterion
          from jsonb_array_elements_text(
            coalesce(v_item.value->'semanticCriteria', '[]'::jsonb)
          ) as criteria(criterion)
        ),
        updated_at = now()
    where lesson_version_id = v_version_id
      and position = v_item.ordinality;
  end loop;

  update public.lesson_versions
  set phases = (
        select jsonb_agg(
          case when phase.value->>'id' = 'speaking'
            then jsonb_set(
              phase.value,
              '{description}',
              to_jsonb('Read each displayed sentence aloud.'::text)
            )
            else phase.value
          end
          order by phase.ordinality
        )
        from jsonb_array_elements(phases) with ordinality as phase(value, ordinality)
      ),
      updated_at = now()
  where id = v_version_id;

  return v_result;
end
$$;

-- Keep existing lesson phase labels accurate. Existing comprehension rows also
-- become playable read-aloud items because the client displays model_answer.
update public.lesson_versions
set phases = (
      select jsonb_agg(
        case when phase.value->>'id' = 'speaking'
          then jsonb_set(
            phase.value,
            '{description}',
            to_jsonb('Read each displayed sentence aloud.'::text)
          )
          else phase.value
        end
        order by phase.ordinality
      )
      from jsonb_array_elements(phases) with ordinality as phase(value, ordinality)
    ),
    updated_at = now()
where jsonb_typeof(phases) = 'array';

-- Future admin imports should write the same phase description. Recreate the
-- already-deployed import function from its stored PL/pgSQL body with only the
-- user-facing speaking description changed.
do $migration$
declare
  v_body text;
  v_old constant text := 'Answer the story questions aloud.';
  v_new constant text := 'Read each displayed sentence aloud.';
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.import_complete_lesson(jsonb,boolean)'
  );

  if v_body is not null and position(v_old in v_body) > 0 then
    v_body := replace(v_body, v_old, v_new);
    execute format(
      'create or replace function public.import_complete_lesson('
        || 'p_package jsonb, p_publish boolean default false'
        || ') returns jsonb language plpgsql security definer '
        || 'set search_path = public, extensions as %L',
      v_body
    );
  end if;
end
$migration$;

revoke all on function public.store_generated_lesson_package_background_package_base(
  uuid, jsonb, integer
) from public;
grant execute on function public.store_generated_lesson_package_background_package_base(
  uuid, jsonb, integer
) to service_role;

comment on column public.lesson_speaking_activities.question_type is
  'read_aloud for current lessons; legacy comprehension types remain readable.';
comment on column public.lesson_speaking_activities.expected_concepts is
  'Legacy semantic-answer data; read-aloud activities store the target sentence.';
comment on column public.lesson_speaking_activities.semantic_criteria is
  'Legacy semantic-answer data; read-aloud evaluation compares STT with model_answer.';
comment on function public.store_generated_lesson_package_background_package_base(
  uuid, jsonb, integer
) is
  'Stores generated lessons with exactly five read-aloud speaking sentences.';
