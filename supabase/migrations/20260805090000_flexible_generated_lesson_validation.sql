-- Trust provider-enforced response schemas and reject generated lesson regions
-- only when they are absent or empty. Exact target/count compliance remains a
-- prompt concern and must not discard an otherwise playable lesson.

do $migration$
declare
  v_body text;
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

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''story'') not between 10 and 20',
    'jsonb_array_length(p_package->''story'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''kanji'') <> 5',
    'jsonb_array_length(p_package->''kanji'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''vocabulary'') not between 8 and 200',
    'jsonb_array_length(p_package->''vocabulary'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''grammar'') <> 3',
    'jsonb_array_length(p_package->''grammar'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''vocabularyQuestions'') not between 10 and 13',
    'jsonb_array_length(p_package->''vocabularyQuestions'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''grammarQuestions'') not between 10 and 13',
    'jsonb_array_length(p_package->''grammarQuestions'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''readingConversation'') not between 4 and 8',
    'jsonb_array_length(p_package->''readingConversation'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''listeningExercises'') not between 1 and 5',
    'jsonb_array_length(p_package->''listeningExercises'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''speakingExercises'') not between 1 and 5',
    'jsonb_array_length(p_package->''speakingExercises'') = 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''reviewQuestions'') <> 5',
    'jsonb_array_length(p_package->''reviewQuestions'') = 0');

  if position('jsonb_array_length(p_package->''kanji'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''vocabularyQuestions'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''reviewQuestions'') = 0' in v_body) = 0 then
    raise exception 'The generated lesson package validator has an unexpected definition';
  end if;

  execute format(
    'create or replace function public.store_generated_lesson_package_v2('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );
end
$migration$;

-- The reading/listening/speaking wrappers keep structural checks, but variable
-- non-zero bank sizes no longer trigger finalization retries.
do $migration$
declare
  v_body text;
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.store_generated_lesson_package_background_reading_base(uuid,jsonb,integer)'
  );
  if v_body is null then
    raise exception 'Reading package writer is unavailable';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''readingQuestions'') not between 3 and 10',
    'jsonb_array_length(p_package->''readingQuestions'') = 0');
  v_body := replace(v_body,
    'if v_easy < 1 or v_medium < 1 or v_hard < 1 then',
    'if false then');
  execute format(
    'create or replace function public.store_generated_lesson_package_background_reading_base('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );

  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.store_generated_lesson_package_background_listening_base(uuid,jsonb,integer)'
  );
  if v_body is null then
    raise exception 'Listening package writer is unavailable';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''listeningExercises'') <> 5',
    'jsonb_array_length(p_package->''listeningExercises'') = 0');
  execute format(
    'create or replace function public.store_generated_lesson_package_background_listening_base('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );

  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.store_generated_lesson_package_background_package_base(uuid,jsonb,integer)'
  );
  if v_body is null then
    raise exception 'Speaking package writer is unavailable';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''speakingExercises'') <> 5',
    'jsonb_array_length(p_package->''speakingExercises'') = 0');
  v_body := replace(v_body,
    'if v_easy <> 2 or v_medium <> 2 or v_hard <> 1 then',
    'if false then');
  execute format(
    'create or replace function public.store_generated_lesson_package_background_package_base('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );
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
  v_key text;
begin
  if p_package is null or jsonb_typeof(p_package) <> 'object' then
    raise exception 'Invalid playable lesson package: package must be an object'
      using errcode = '22023';
  end if;

  if coalesce(p_package->>'schemaVersion', '') <> '2' then
    raise exception 'Invalid playable lesson package: schemaVersion must be 2'
      using errcode = '22023';
  end if;

  if btrim(coalesce(p_package->>'title', '')) = ''
     or btrim(coalesce(p_package->>'japaneseTitle', '')) = ''
     or btrim(coalesce(p_package->>'summary', '')) = '' then
    raise exception 'Invalid playable lesson package: lesson text must not be empty'
      using errcode = '22023';
  end if;

  foreach v_key in array array[
    'story',
    'kanji',
    'vocabulary',
    'grammar',
    'vocabularyQuestions',
    'grammarQuestions',
    'readingConversation',
    'listeningExercises',
    'speakingExercises',
    'reviewQuestions'
  ]
  loop
    if jsonb_typeof(p_package->v_key) <> 'array' then
      raise exception 'Invalid playable lesson package: % must be an array', v_key
        using errcode = '22023';
    end if;
    if jsonb_array_length(p_package->v_key) = 0 then
      raise exception 'Invalid playable lesson package: % must not be empty', v_key
        using errcode = '22023';
    end if;
  end loop;
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb)
  from public;
grant execute on function public.assert_playable_lesson_package_shape(jsonb)
  to service_role;

comment on function public.assert_playable_lesson_package_shape(jsonb) is
  'Accepts variable generated lesson counts and rejects only missing or empty playable regions.';
