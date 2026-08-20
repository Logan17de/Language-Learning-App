-- Learner interests are preference-only data. The active lesson contract is:
-- explicit /learn topic + selected JLPT level -> lesson.
-- No assignment, generation, reuse, quota, scoring, or mastery path may depend
-- on interests. Historical migrations may retain old names, but final runtime
-- functions and lesson_assignments must not.

-- Retire superseded generation entry points. v2/v3 read profile interests and
-- v4 delegates to v3; none are part of the current application call graph.
drop function if exists public.begin_custom_lesson_generation_v4(text, public.jlpt_level);
drop function if exists public.begin_custom_lesson_generation_v3(text, public.jlpt_level);
drop function if exists public.begin_custom_lesson_generation_v2(text, public.jlpt_level);

-- This pre-progressive storage entry point is superseded by the background
-- storage chain and still carries the removed assignment field.
drop function if exists public.store_generated_lesson_package(uuid, jsonb, integer);

-- Remove the stale assignment field from the sole learner-facing generation
-- RPC. pg_get_functiondef() is free to reformat function SQL, so use
-- whitespace-insensitive replacements instead of depending on line layout.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'begin_custom_lesson_generation_v5'
    and pg_get_function_identity_arguments(p.oid) = 'p_topic text, p_level jlpt_level';

  if v_definition is null then
    raise exception 'begin_custom_lesson_generation_v5(text,jlpt_level) is required';
  end if;

  v_definition := regexp_replace(
    v_definition,
    'algorithm_version[[:space:]]*,[[:space:]]*interest_matches[[:space:]]*\)[[:space:]]*values[[:space:]]*\(',
    E'algorithm_version\n    ) values (',
    'i'
  );
  v_definition := regexp_replace(
    v_definition,
    '''custom-exact-reuse-v[12]''[[:space:]]*,[[:space:]]*''\{\}''[[:space:]]*\)',
    E'''custom-exact-reuse-v3''\n    )',
    'i'
  );

  if v_definition ilike '%interest_matches%'
     or v_definition ilike '%profiles.interests%'
     or v_definition ilike '%pro_interest%' then
    raise exception 'begin_custom_lesson_generation_v5 still contains interest-based lesson behavior';
  end if;

  execute v_definition;
end
$$;

-- The durable worker calls store_generated_lesson_package_background(), whose
-- compatibility chain currently delegates into v2. Keep that implementation,
-- but remove the retired assignment field and normalize all new/reused custom
-- lesson assignments to custom_topic.
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'store_generated_lesson_package_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'p_request_id uuid, p_package jsonb, p_generation_seconds integer';

  if v_definition is null then
    raise exception 'store_generated_lesson_package_v2(uuid,jsonb,integer) is required';
  end if;

  v_definition := regexp_replace(
    v_definition,
    'algorithm_version[[:space:]]*,[[:space:]]*interest_matches[[:space:]]*\)[[:space:]]*values[[:space:]]*\(',
    E'algorithm_version\n    ) values (',
    'gi'
  );
  v_definition := regexp_replace(
    v_definition,
    '''custom-signature-reuse-v2''[[:space:]]*,[[:space:]]*''\{\}''[[:space:]]*\)',
    E'''custom-signature-reuse-v3''\n    )',
    'i'
  );
  v_definition := regexp_replace(
    v_definition,
    '''custom-playable-v2''[[:space:]]*,[[:space:]]*''\{\}''[[:space:]]*\)',
    E'''custom-playable-v3''\n  )',
    'i'
  );
  v_definition := replace(v_definition, '''pro_custom''', '''custom_topic''');

  if v_definition ilike '%interest_matches%'
     or v_definition like '%''pro_custom''%'
     or v_definition ilike '%profiles.interests%'
     or v_definition ilike '%pro_interest%' then
    raise exception 'Generated lesson storage still contains a retired assignment contract';
  end if;

  execute v_definition;
end
$$;

-- Historical modes remain reportable only when they are no longer active.
-- Any still-live old custom assignment is the same explicit-topic product and
-- is normalized to custom_topic. Predefined standard assignments are retired.
update public.lesson_assignments
set selection_mode = 'custom_topic', updated_at = now()
where selection_mode = 'pro_custom'
  and status in ('assigned', 'started');

update public.lesson_sessions session
set status = 'abandoned',
    last_saved_at = now(),
    updated_at = now()
where session.status = 'active'
  and exists (
    select 1
    from public.lesson_assignments assignment
    where assignment.user_id = session.user_id
      and assignment.lesson_id = session.lesson_id
      and assignment.lesson_version_id = session.lesson_version_id
      and assignment.selection_mode = 'standard'
      and assignment.status in ('assigned', 'started')
  );

update public.lesson_assignments
set status = 'abandoned', updated_at = now()
where selection_mode = 'standard'
  and status in ('assigned', 'started');

alter table public.lesson_assignments
  drop constraint if exists lesson_assignments_selection_mode_check;

alter table public.lesson_assignments
  add constraint lesson_assignments_selection_mode_check
  check (
    selection_mode = 'custom_topic'
    or (
      selection_mode in ('standard', 'pro_custom')
      and status in ('completed', 'abandoned')
    )
  );

comment on function public.begin_custom_lesson_generation_v5(text, public.jlpt_level) is
  'Starts or reuses a lesson using only the learner-entered topic and selected JLPT level. Interests are not lesson inputs.';

-- Fail migration replay if an interest-based lesson contract survives.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'lesson_assignments'
      and column_name ilike '%interest%'
  ) then
    raise exception 'lesson_assignments must not contain interest fields';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        pg_get_functiondef(p.oid) ilike '%interest_matches%'
        or pg_get_functiondef(p.oid) ilike '%profiles.interests%'
        or pg_get_functiondef(p.oid) ilike '%pro_interest%'
      )
  ) then
    raise exception 'Active database functions still contain interest-based lesson behavior';
  end if;
end
$$;
