-- Final-review generation was retired from the six-phase lesson contract.
-- Remove the last durable-worker compatibility state instead of carrying an
-- empty review checkpoint forever. Historical migrations remain untouched.

update public.progressive_lesson_drafts
set completed_groups = array_remove(completed_groups, 'final_review'),
    failed_groups = array_remove(failed_groups, 'final_review'),
    group_attempts = group_attempts - 'final_review',
    updated_at = now()
where 'final_review' = any(completed_groups)
   or 'final_review' = any(failed_groups)
   or group_attempts ? 'final_review';

drop trigger if exists default_empty_progressive_review_group
  on public.progressive_lesson_drafts;
drop function if exists public.default_empty_progressive_review_group();

alter table public.progressive_lesson_drafts
  drop column if exists review_group;

create or replace function public.save_progressive_lesson_group(
  p_request_id uuid,
  p_worker_token uuid,
  p_group text,
  p_payload jsonb,
  p_audit jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
  v_completed text[];
  v_progress integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_group not in (
    'vocabulary_and_kanji',
    'grammar_and_reading',
    'listening_and_speaking'
  ) then
    raise exception 'Unknown activity group' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Activity group payload must be an object'
      using errcode = '22023';
  end if;

  select array_agg(distinct value order by value)
  into v_completed
  from unnest(
    coalesce(
      (
        select completed_groups
        from public.progressive_lesson_drafts
        where request_id = p_request_id
          and worker_token = p_worker_token
        for update
      ),
      '{}'
    ) || array[p_group]
  ) value;

  if v_completed is null then
    raise exception 'Generation job is no longer claimed'
      using errcode = '40001';
  end if;

  v_progress := least(74, 26 + cardinality(v_completed) * 12);

  update public.progressive_lesson_drafts
  set vocabulary_kanji_group = case
        when p_group = 'vocabulary_and_kanji' then p_payload
        else vocabulary_kanji_group
      end,
      grammar_reading_group = case
        when p_group = 'grammar_and_reading' then p_payload
        else grammar_reading_group
      end,
      communication_group = case
        when p_group = 'listening_and_speaking' then p_payload
        else communication_group
      end,
      completed_groups = v_completed,
      failed_groups = array_remove(failed_groups, p_group),
      generation_audit = generation_audit || jsonb_build_array(p_audit),
      current_stage = p_group,
      progress_percent = greatest(progress_percent, v_progress),
      last_error = null,
      updated_at = now()
  where request_id = p_request_id
    and worker_token = p_worker_token
  returning * into v_job;

  if not found then
    raise exception 'Generation job is no longer claimed'
      using errcode = '40001';
  end if;

  return to_jsonb(v_job);
end
$$;

revoke all on function public.save_progressive_lesson_group(
  uuid, uuid, text, jsonb, jsonb
) from public;
grant execute on function public.save_progressive_lesson_group(
  uuid, uuid, text, jsonb, jsonb
) to service_role;

-- The public/current playable package no longer carries even an empty
-- reviewQuestions field. The historical V2 writer tolerates an absent key and
-- therefore persists no lesson_review_activities rows for new lessons.
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
  if p_package ? 'reviewQuestions' then
    raise exception 'Invalid playable lesson package: reviewQuestions is retired'
      using errcode = '22023';
  end if;
end
$$;

revoke all on function public.assert_playable_lesson_package_shape(jsonb)
  from public;
grant execute on function public.assert_playable_lesson_package_shape(jsonb)
  to service_role;

comment on function public.save_progressive_lesson_group(
  uuid, uuid, text, jsonb, jsonb
) is
  'Persists one of the three current custom-lesson activity groups.';
comment on function public.assert_playable_lesson_package_shape(jsonb) is
  'Current six-phase custom lesson gate: 7 vocabulary, 7 grammar, 5 reading MCQs, 5 listening, 5 speaking, with no review payload.';
