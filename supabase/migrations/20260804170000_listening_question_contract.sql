-- Preserve the exact listening_test.py response fields after deterministic
-- adaptation into the existing listening player and audio pipeline.

alter table public.lesson_listening_activities
  add column difficulty text not null default 'medium'
    check (difficulty in ('easy', 'medium', 'hard')),
  add column conversation_lines text[] not null default '{}';

alter function public.store_generated_lesson_package_background(uuid, jsonb, integer)
  rename to store_generated_lesson_package_background_reading_base;

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
  v_answer_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package->'listeningExercises') <> 'array'
     or jsonb_array_length(p_package->'listeningExercises') <> 5 then
    raise exception 'Invalid listening question bank' using errcode = '22023';
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'listeningExercises') with ordinality
  loop
    if v_item.value->>'difficulty' not in ('Easy', 'Medium', 'Hard')
       or jsonb_typeof(v_item.value->'conversationLines') <> 'array'
       or jsonb_typeof(v_item.value->'choices') <> 'array'
       or btrim(coalesce(v_item.value->>'prompt', '')) = ''
       or btrim(coalesce(v_item.value->>'correctAnswer', '')) = '' then
      raise exception 'Invalid listening question at position %', v_item.ordinality
        using errcode = '22023';
    end if;

    if jsonb_array_length(v_item.value->'conversationLines') not between 5 and 10
       or jsonb_array_length(v_item.value->'choices') <> 4 then
      raise exception 'Invalid listening question structure at position %', v_item.ordinality
        using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(v_item.value->'conversationLines') as lines(line)
      where btrim(line) = ''
    ) or (
      select count(distinct lower(btrim(choice)))
      from jsonb_array_elements_text(v_item.value->'choices') as choices(choice)
    ) <> 4 then
      raise exception 'Listening lines and choices must be nonempty and unique at position %',
        v_item.ordinality using errcode = '22023';
    end if;

    select count(*)
    into v_answer_count
    from jsonb_array_elements_text(v_item.value->'choices') as choices(choice)
    where lower(btrim(choice)) = lower(btrim(v_item.value->>'correctAnswer'));

    if v_answer_count <> 1 then
      raise exception 'Listening answer must match exactly one choice at position %',
        v_item.ordinality using errcode = '22023';
    end if;
  end loop;

  v_result := public.store_generated_lesson_package_background_reading_base(
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
    from jsonb_array_elements(p_package->'listeningExercises') with ordinality
  loop
    update public.lesson_listening_activities
    set difficulty = lower(v_item.value->>'difficulty'),
        conversation_lines = array(
          select line
          from jsonb_array_elements_text(v_item.value->'conversationLines') as lines(line)
        ),
        updated_at = now()
    where lesson_version_id = v_version_id
      and position = v_item.ordinality;
  end loop;

  return v_result;
end
$$;

revoke all on function public.store_generated_lesson_package_background_reading_base(
  uuid, jsonb, integer
) from public;
revoke all on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) from public;
grant execute on function public.store_generated_lesson_package_background_reading_base(
  uuid, jsonb, integer
) to service_role;
grant execute on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) to service_role;

comment on column public.lesson_listening_activities.conversation_lines is
  'The exact 5-10 line conversation returned by the listening question model.';
comment on column public.lesson_listening_activities.difficulty is
  'The exact easy, medium, or hard label returned for this listening question.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Stores a generated lesson with strict reading and listening question banks.';
