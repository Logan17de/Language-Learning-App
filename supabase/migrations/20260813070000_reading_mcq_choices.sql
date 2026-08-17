-- Final custom-lesson activity contract:
-- vocabulary/kanji 7, grammar 7, reading 5 MCQs, listening 5,
-- speaking 5, and no final-review phase.

alter table public.lesson_reading_questions
  add column if not exists choices text[] not null default '{}';

-- New lessons have six learner phases. Final review is intentionally removed.
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
    {"id":"reading","label":"Reading","description":"Read closely and answer comprehension questions."},
    {"id":"listening","label":"Listening","description":"Listen for meaning."},
    {"id":"speaking","label":"Speaking","description":"Read each displayed sentence aloud."}
  ]'::jsonb;
  return new;
end
$$;

-- The durable worker still has a legacy review_group column in its additive
-- schema. Keep it as an empty object so older assembly plumbing can consume it
-- without scheduling a review-generation checkpoint.
create or replace function public.default_empty_progressive_review_group()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.review_group is null then
    new.review_group := '{"reviewQuestions":[]}'::jsonb;
  end if;
  return new;
end
$$;

drop trigger if exists default_empty_progressive_review_group
  on public.progressive_lesson_drafts;
create trigger default_empty_progressive_review_group
before insert on public.progressive_lesson_drafts
for each row
execute function public.default_empty_progressive_review_group();

update public.progressive_lesson_drafts
set review_group = '{"reviewQuestions":[]}'::jsonb,
    updated_at = now()
where review_group is null
  and status not in ('completed', 'permanent_failure');

-- Tighten the underlying generated-package writer to the one current shape.
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
    'jsonb_array_length(p_package->''vocabularyQuestions'') <> 13',
    'jsonb_array_length(p_package->''vocabularyQuestions'') <> 7');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''vocabularyQuestions'') = 0',
    'jsonb_array_length(p_package->''vocabularyQuestions'') <> 7');

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''grammarQuestions'') <> 10',
    'jsonb_array_length(p_package->''grammarQuestions'') <> 7');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''grammarQuestions'') = 0',
    'jsonb_array_length(p_package->''grammarQuestions'') <> 7');

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''readingQuestions'') <> 7',
    'jsonb_array_length(p_package->''readingQuestions'') <> 5');

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''listeningExercises'') <> 7',
    'jsonb_array_length(p_package->''listeningExercises'') <> 5');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''speakingExercises'') <> 7',
    'jsonb_array_length(p_package->''speakingExercises'') <> 5');

  v_body := replace(v_body,
    'jsonb_array_length(p_package->''reviewQuestions'') <> 5',
    'jsonb_array_length(p_package->''reviewQuestions'') <> 0');
  v_body := replace(v_body,
    'jsonb_array_length(p_package->''reviewQuestions'') = 0',
    'jsonb_array_length(p_package->''reviewQuestions'') <> 0');

  if position('jsonb_array_length(p_package->''vocabularyQuestions'') <> 7' in v_body) = 0
     or position('jsonb_array_length(p_package->''grammarQuestions'') <> 7' in v_body) = 0
     or position('jsonb_array_length(p_package->''reviewQuestions'') <> 0' in v_body) = 0 then
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
    'story', 'kanji', 'vocabulary', 'grammar', 'readingConversation'
  ]
  loop
    if jsonb_typeof(p_package->v_key) <> 'array'
       or jsonb_array_length(p_package->v_key) = 0 then
      raise exception 'Invalid playable lesson package: % must be a non-empty array', v_key
        using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_package->'vocabularyQuestions') <> 'array'
     or jsonb_array_length(p_package->'vocabularyQuestions') <> 7 then
    raise exception 'Invalid playable lesson package: vocabularyQuestions must contain exactly 7 items'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_package->'grammarQuestions') <> 'array'
     or jsonb_array_length(p_package->'grammarQuestions') <> 7 then
    raise exception 'Invalid playable lesson package: grammarQuestions must contain exactly 7 items'
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
     or jsonb_array_length(p_package->'reviewQuestions') <> 0 then
    raise exception 'Invalid playable lesson package: reviewQuestions must be empty'
      using errcode = '22023';
  end if;
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb)
  from public;
grant execute on function public.assert_playable_lesson_package_shape(jsonb)
  to service_role;

-- Add reading MCQ choice persistence around the existing background writer.
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

  perform public.assert_playable_lesson_package_shape(p_package);

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'readingQuestions') with ordinality
  loop
    if jsonb_typeof(v_item.value->'choices') <> 'array'
       or jsonb_array_length(v_item.value->'choices') <> 4 then
      raise exception 'Reading MCQ at position % requires exactly four choices', v_item.ordinality
        using errcode = '22023';
    end if;

    select array_agg(choice order by ordinality)
    into v_choices
    from jsonb_array_elements_text(v_item.value->'choices')
      with ordinality as choices(choice, ordinality);

    if cardinality(v_choices) <> 4
       or exists (select 1 from unnest(v_choices) as choice where btrim(choice) = '')
       or (select count(distinct lower(btrim(choice))) from unnest(v_choices) as choice) <> 4
       or not (btrim(coalesce(v_item.value->>'answer', '')) = any(v_choices)) then
      raise exception 'Reading MCQ at position % has invalid choices or answer', v_item.ordinality
        using errcode = '22023';
    end if;
  end loop;

  v_result := public.store_generated_lesson_package_background_reading_mcq_base(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
  v_version_id := (v_result->>'lesson_version_id')::uuid;

  if v_version_id is null then
    raise exception 'Stored lesson version was not returned' using errcode = '22023';
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'readingQuestions') with ordinality
  loop
    select array_agg(choice order by ordinality)
    into v_choices
    from jsonb_array_elements_text(v_item.value->'choices')
      with ordinality as choices(choice, ordinality);

    update public.lesson_reading_questions
    set choices = v_choices,
        updated_at = now()
    where lesson_version_id = v_version_id
      and position = v_item.ordinality;
  end loop;

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
  'Exactly four answer choices for generated reading-comprehension MCQs.';
comment on function public.assert_playable_lesson_package_shape(jsonb) is
  'Current custom lesson gate: 7 vocabulary, 7 grammar, 5 reading MCQs, 5 listening, 5 speaking, no final review.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Stores the current 7/7/5/5/5 custom lesson shape and persists reading MCQ choices.';
