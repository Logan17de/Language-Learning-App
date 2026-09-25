-- Remove stale database functions left behind by later schema/lesson-contract changes.
--
-- import_legacy_progress is no longer part of the application contract. It is not
-- executable by application roles, still references the removed interests column,
-- and would write server-owned reward fields if it were ever re-granted.
--
-- Progressive lesson generation now has exactly three activity groups. Keep the
-- active service-role worker invalidation RPC, but remove its retired final_review
-- / review_group compatibility.

drop function if exists public.import_legacy_progress(jsonb);

create or replace function public.invalidate_progressive_lesson_group(
  p_request_id uuid,
  p_group text,
  p_reason text,
  p_worker_token uuid
)
returns public.progressive_lesson_drafts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result public.progressive_lesson_drafts%rowtype;
begin
  if p_group is null or p_group not in (
    'vocabulary_and_kanji',
    'grammar_and_reading',
    'listening_and_speaking'
  ) then
    raise exception 'Unsupported lesson group' using errcode = '22023';
  end if;

  update public.progressive_lesson_drafts
  set vocabulary_kanji_group = case
        when p_group = 'vocabulary_and_kanji' then null
        else vocabulary_kanji_group
      end,
      grammar_reading_group = case
        when p_group = 'grammar_and_reading' then null
        else grammar_reading_group
      end,
      communication_group = case
        when p_group = 'listening_and_speaking' then null
        else communication_group
      end,
      completed_groups = array_remove(completed_groups, p_group),
      failed_groups = array(
        select distinct value
        from unnest(failed_groups || array[p_group]) value
        order by value
      ),
      lesson_package = null,
      last_error = left(coalesce(p_reason, 'Invalid activity checkpoint'), 1000),
      last_action = 'invalidated_checkpoint',
      updated_at = now()
  where request_id = p_request_id
    and worker_token = p_worker_token
  returning * into v_result;

  if v_result.request_id is null then
    raise exception 'Progressive draft worker claim mismatch' using errcode = '55000';
  end if;

  return v_result;
end;
$$;

-- This is an internal durable-worker operation. Learners must never invoke it.
revoke all on function public.invalidate_progressive_lesson_group(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.invalidate_progressive_lesson_group(uuid, text, text, uuid)
  to service_role;

-- Fail the migration if the retired contracts reappear or the worker ACL drifts.
do $$
declare
  v_function oid := to_regprocedure(
    'public.invalidate_progressive_lesson_group(uuid,text,text,uuid)'
  );
  v_definition text;
begin
  if to_regprocedure('public.import_legacy_progress(jsonb)') is not null then
    raise exception 'Obsolete import_legacy_progress function still exists';
  end if;

  if v_function is null then
    raise exception 'invalidate_progressive_lesson_group function is missing';
  end if;

  select pg_get_functiondef(v_function) into v_definition;

  if v_definition ilike '%review_group%'
     or v_definition ilike '%final_review%' then
    raise exception 'Retired final-review contract remains in invalidation function';
  end if;

  if v_definition not ilike '%vocabulary_and_kanji%'
     or v_definition not ilike '%grammar_and_reading%'
     or v_definition not ilike '%listening_and_speaking%' then
    raise exception 'Current three-group invalidation contract is incomplete';
  end if;

  if has_function_privilege('anon', v_function, 'EXECUTE')
     or has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'Learner roles can execute progressive group invalidation';
  end if;

  if not has_function_privilege('service_role', v_function, 'EXECUTE') then
    raise exception 'service_role cannot execute progressive group invalidation';
  end if;
end;
$$;
