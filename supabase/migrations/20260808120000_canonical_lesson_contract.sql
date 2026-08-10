-- Make the seven-phase learner flow a database contract and restore exact
-- activity-bank sizes for generated lessons. The application must never have
-- to guess which shape a stored lesson uses.

create or replace function public.enforce_canonical_lesson_phases()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.phases := '[
    {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
    {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
    {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
    {"id":"reading","label":"Reading","description":"Read closely and answer in Japanese."},
    {"id":"listening","label":"Listening","description":"Listen for meaning."},
    {"id":"speaking","label":"Speaking","description":"Read each displayed sentence aloud."},
    {"id":"review","label":"Final review","description":"Retrieve the lesson without hints."}
  ]'::jsonb;
  return new;
end
$$;

drop trigger if exists enforce_canonical_lesson_phases
  on public.lesson_versions;

create trigger enforce_canonical_lesson_phases
before insert or update of phases on public.lesson_versions
for each row
execute function public.enforce_canonical_lesson_phases();

-- Normalize every historical version as well. This intentionally changes only
-- phase metadata/order; learner content and activity rows are untouched.
update public.lesson_versions
set phases = '[
  {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
  {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
  {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
  {"id":"reading","label":"Reading","description":"Read closely and answer in Japanese."},
  {"id":"listening","label":"Listening","description":"Listen for meaning."},
  {"id":"speaking","label":"Speaking","description":"Read each displayed sentence aloud."},
  {"id":"review","label":"Final review","description":"Retrieve the lesson without hints."}
]'::jsonb,
updated_at = now()
where phases is distinct from '[
  {"id":"story","label":"Story","description":"Meet today''s Japanese in context."},
  {"id":"vocabulary","label":"Words & kanji","description":"Build meaning and recognition."},
  {"id":"grammar","label":"Grammar","description":"Use the selected patterns."},
  {"id":"reading","label":"Reading","description":"Read closely and answer in Japanese."},
  {"id":"listening","label":"Listening","description":"Listen for meaning."},
  {"id":"speaking","label":"Speaking","description":"Read each displayed sentence aloud."},
  {"id":"review","label":"Final review","description":"Retrieve the lesson without hints."}
]'::jsonb;

-- PR #32 temporarily relaxed generated-package counts to non-empty regions.
-- Restore the player-facing bank sizes while retaining that PR's flexibility
-- for story length and the number of story-backed kanji/grammar records.
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

  if position('jsonb_array_length(p_package->''vocabularyQuestions'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''grammarQuestions'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''listeningExercises'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''speakingExercises'') = 0' in v_body) = 0
     or position('jsonb_array_length(p_package->''reviewQuestions'') = 0' in v_body) = 0 then
    raise exception 'The generated lesson package validator has an unexpected definition';
  end if;

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''vocabularyQuestions'') = 0',
    'jsonb_array_length(p_package->''vocabularyQuestions'') <> 13');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''grammarQuestions'') = 0',
    'jsonb_array_length(p_package->''grammarQuestions'') <> 10');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''listeningExercises'') = 0',
    'jsonb_array_length(p_package->''listeningExercises'') <> 5');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''speakingExercises'') = 0',
    'jsonb_array_length(p_package->''speakingExercises'') <> 5');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''reviewQuestions'') = 0',
    'jsonb_array_length(p_package->''reviewQuestions'') <> 5');

  execute format(
    'create or replace function public.store_generated_lesson_package_v2('
      || 'p_request_id uuid, p_package jsonb, p_generation_seconds integer'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public, extensions as %L',
    v_body
  );
end
$migration$;

-- The progressive background writers are wrappers around the same canonical
-- package. Re-tighten their section-specific checks too.
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
  if position('jsonb_array_length(p_package->''readingQuestions'') = 0' in v_body) = 0 then
    raise exception 'The reading package writer has an unexpected definition';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''readingQuestions'') = 0',
    'jsonb_array_length(p_package->''readingQuestions'') <> 5');
  if position('if false then' in v_body) > 0 then
    v_body := replace(v_body,
      'if false then',
      'if v_easy <> 2 or v_medium <> 2 or v_hard <> 1 then');
  end if;
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
  if position('jsonb_array_length(p_package->''listeningExercises'') = 0' in v_body) = 0 then
    raise exception 'The listening package writer has an unexpected definition';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''listeningExercises'') = 0',
    'jsonb_array_length(p_package->''listeningExercises'') <> 5');
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
  if position('jsonb_array_length(p_package->''speakingExercises'') = 0' in v_body) = 0 then
    raise exception 'The speaking package writer has an unexpected definition';
  end if;
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''speakingExercises'') = 0',
    'jsonb_array_length(p_package->''speakingExercises'') <> 5');
  if position('if false then' in v_body) > 0 then
    v_body := replace(v_body,
      'if false then',
      'if v_easy <> 2 or v_medium <> 2 or v_hard <> 1 then');
  end if;
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
    'readingConversation'
  ]
  loop
    if jsonb_typeof(p_package->v_key) <> 'array'
       or jsonb_array_length(p_package->v_key) = 0 then
      raise exception 'Invalid playable lesson package: % must be a non-empty array', v_key
        using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_package->'vocabularyQuestions') <> 'array'
     or jsonb_array_length(p_package->'vocabularyQuestions') <> 13 then
    raise exception 'Invalid playable lesson package: vocabularyQuestions must contain exactly 13 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'grammarQuestions') <> 'array'
     or jsonb_array_length(p_package->'grammarQuestions') <> 10 then
    raise exception 'Invalid playable lesson package: grammarQuestions must contain exactly 10 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'readingQuestions') <> 'array'
     or jsonb_array_length(p_package->'readingQuestions') <> 5 then
    raise exception 'Invalid playable lesson package: readingQuestions must contain exactly 5 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'listeningExercises') <> 'array'
     or jsonb_array_length(p_package->'listeningExercises') <> 5 then
    raise exception 'Invalid playable lesson package: listeningExercises must contain exactly 5 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'speakingExercises') <> 'array'
     or jsonb_array_length(p_package->'speakingExercises') <> 5 then
    raise exception 'Invalid playable lesson package: speakingExercises must contain exactly 5 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'reviewQuestions') <> 'array'
     or jsonb_array_length(p_package->'reviewQuestions') <> 5 then
    raise exception 'Invalid playable lesson package: reviewQuestions must contain exactly 5 items'
      using errcode = '22023';
  end if;
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb)
  from public;
grant execute on function public.assert_playable_lesson_package_shape(jsonb)
  to service_role;

comment on function public.assert_playable_lesson_package_shape(jsonb) is
  'Canonical generated lesson gate: 13 vocabulary, 10 grammar, and 5 reading/listening/speaking/review activities.';
