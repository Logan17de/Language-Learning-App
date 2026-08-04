-- Keep the complete story enrichment attached to generated lessons. A single
-- twenty-sentence passage routinely contains more than the legacy 40-term
-- practice-bank limit, while still remaining a small, bounded lesson payload.

do $migration$
declare
  v_body text;
  v_old_check constant text :=
    'or jsonb_array_length(p_package->''vocabulary'') not between 8 and 40';
  v_new_check constant text :=
    'or jsonb_array_length(p_package->''vocabulary'') not between 8 and 200';
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.store_generated_lesson_package_v2(uuid,jsonb,integer)'
  );

  if v_body is null then
    raise exception 'store_generated_lesson_package_v2 is unavailable';
  end if;

  if position(v_new_check in v_body) = 0 then
    if position(v_old_check in v_body) = 0 then
      raise exception 'The generated lesson vocabulary validator has an unexpected definition';
    end if;

    v_body := replace(v_body, v_old_check, v_new_check);
    execute format(
      'create or replace function public.store_generated_lesson_package_v2('
        || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
        || ') returns jsonb language plpgsql security definer '
        || 'set search_path = public as %L',
      v_body
    );
  end if;
end
$migration$;

create or replace function public.assert_playable_lesson_package_shape(
  p_package jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception 'Invalid playable lesson package: package must be an object'
      using errcode = '22023';
  end if;

  if coalesce(p_package->>'schemaVersion', '') <> '2' then
    raise exception 'Invalid playable lesson package: schemaVersion must be 2'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_package->>'title', '')) = '' then
    raise exception 'Invalid playable lesson package: title is required'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_package->>'japaneseTitle', '')) = '' then
    raise exception 'Invalid playable lesson package: japaneseTitle is required'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_package->>'summary', '')) = '' then
    raise exception 'Invalid playable lesson package: summary is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'story') <> 'array' then
    raise exception 'Invalid playable lesson package: story must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'story');
  if v_count not between 10 and 20 then
    raise exception 'Invalid playable lesson package: story must contain 10 to 20 lines (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'kanji') <> 'array' then
    raise exception 'Invalid playable lesson package: kanji must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'kanji');
  if v_count <> 5 then
    raise exception 'Invalid playable lesson package: kanji must contain 5 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'vocabulary') <> 'array' then
    raise exception 'Invalid playable lesson package: vocabulary must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'vocabulary');
  if v_count not between 8 and 200 then
    raise exception 'Invalid playable lesson package: vocabulary must contain 8 to 200 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'grammar') <> 'array' then
    raise exception 'Invalid playable lesson package: grammar must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'grammar');
  if v_count <> 3 then
    raise exception 'Invalid playable lesson package: grammar must contain 3 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'vocabularyQuestions') <> 'array' then
    raise exception 'Invalid playable lesson package: vocabularyQuestions must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'vocabularyQuestions');
  if v_count not between 10 and 13 then
    raise exception 'Invalid playable lesson package: vocabularyQuestions must contain 10 to 13 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'grammarQuestions') <> 'array' then
    raise exception 'Invalid playable lesson package: grammarQuestions must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'grammarQuestions');
  if v_count not between 10 and 13 then
    raise exception 'Invalid playable lesson package: grammarQuestions must contain 10 to 13 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'readingConversation') <> 'array' then
    raise exception 'Invalid playable lesson package: readingConversation must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'readingConversation');
  if v_count not between 4 and 8 then
    raise exception 'Invalid playable lesson package: readingConversation must contain 4 to 8 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'listeningExercises') <> 'array' then
    raise exception 'Invalid playable lesson package: listeningExercises must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'listeningExercises');
  if v_count not between 1 and 5 then
    raise exception 'Invalid playable lesson package: listeningExercises must contain 1 to 5 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'speakingExercises') <> 'array' then
    raise exception 'Invalid playable lesson package: speakingExercises must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'speakingExercises');
  if v_count not between 1 and 5 then
    raise exception 'Invalid playable lesson package: speakingExercises must contain 1 to 5 items (received %)',
      v_count using errcode = '22023';
  end if;

  if jsonb_typeof(p_package->'reviewQuestions') <> 'array' then
    raise exception 'Invalid playable lesson package: reviewQuestions must be an array'
      using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_package->'reviewQuestions');
  if v_count <> 5 then
    raise exception 'Invalid playable lesson package: reviewQuestions must contain 5 items (received %)',
      v_count using errcode = '22023';
  end if;
end
$$;

alter function public.store_generated_lesson_package_background(uuid, jsonb, integer)
  rename to store_generated_lesson_package_background_package_base;

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
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  perform public.assert_playable_lesson_package_shape(p_package);

  return public.store_generated_lesson_package_background_package_base(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb) from public;
revoke all on function public.store_generated_lesson_package_background_package_base(
  uuid, jsonb, integer
) from public;
revoke all on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) from public;

grant execute on function public.assert_playable_lesson_package_shape(jsonb)
  to service_role;
grant execute on function public.store_generated_lesson_package_background_package_base(
  uuid, jsonb, integer
) to service_role;
grant execute on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) to service_role;

comment on function public.assert_playable_lesson_package_shape(jsonb) is
  'Raises a field-specific error when an assembled generated lesson has an invalid package shape.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Validates and stores generated lessons with up to 200 enriched vocabulary terms.';
