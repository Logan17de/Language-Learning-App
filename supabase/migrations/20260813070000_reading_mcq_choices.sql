-- Add persisted answer choices for new reading-comprehension MCQs without
-- breaking older short-answer reading lessons.

alter table public.lesson_reading_questions
  add column if not exists choices text[] not null default '{}';

alter function public.store_generated_lesson_package_background(uuid, jsonb, integer)
  rename to store_generated_lesson_package_background_reading_mcq_base;

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
  v_choices text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package->'readingQuestions') = 'array' then
    for v_item in
      select value, ordinality
      from jsonb_array_elements(p_package->'readingQuestions') with ordinality
    loop
      if v_item.value ? 'choices' then
        if jsonb_typeof(v_item.value->'choices') <> 'array'
           or jsonb_array_length(v_item.value->'choices') <> 4 then
          raise exception 'Reading MCQ at position % requires exactly four choices', v_item.ordinality
            using errcode = '22023';
        end if;

        select array_agg(choice order by ordinality)
        into v_choices
        from jsonb_array_elements_text(v_item.value->'choices') with ordinality as choices(choice, ordinality);

        if cardinality(v_choices) <> 4
           or exists (
             select 1
             from unnest(v_choices) as choice
             where btrim(choice) = ''
           )
           or (
             select count(distinct lower(btrim(choice)))
             from unnest(v_choices) as choice
           ) <> 4
           or not (btrim(coalesce(v_item.value->>'answer', '')) = any(v_choices)) then
          raise exception 'Reading MCQ at position % has invalid choices or answer', v_item.ordinality
            using errcode = '22023';
        end if;
      end if;
    end loop;
  end if;

  v_result := public.store_generated_lesson_package_background_reading_mcq_base(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
  v_version_id := (v_result->>'lesson_version_id')::uuid;

  if v_version_id is null then
    raise exception 'Stored lesson version was not returned' using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'readingQuestions') = 'array' then
    for v_item in
      select value, ordinality
      from jsonb_array_elements(p_package->'readingQuestions') with ordinality
    loop
      if jsonb_typeof(v_item.value->'choices') = 'array' then
        select array_agg(choice order by ordinality)
        into v_choices
        from jsonb_array_elements_text(v_item.value->'choices') with ordinality as choices(choice, ordinality);

        update public.lesson_reading_questions
        set choices = v_choices,
            updated_at = now()
        where lesson_version_id = v_version_id
          and position = v_item.ordinality;
      end if;
    end loop;
  end if;

  return v_result;
end
$$;

revoke all on function public.store_generated_lesson_package_background_reading_mcq_base(
  uuid, jsonb, integer
) from public;
revoke all on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) from public;
grant execute on function public.store_generated_lesson_package_background_reading_mcq_base(
  uuid, jsonb, integer
) to service_role;
grant execute on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) to service_role;

comment on column public.lesson_reading_questions.choices is
  'Four answer choices for generated reading MCQs. Empty for legacy short-answer reading questions.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Stores generated lessons and persists reading MCQ choices while preserving legacy short-answer compatibility.';
