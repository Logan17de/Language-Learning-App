-- Collapse progressive lesson group invalidation back to the worker's canonical RPC.
--
-- A previous cleanup accidentally created a second overload with the worker token
-- in the last position. PostgREST resolves RPCs by named arguments, so keeping two
-- functions with the same four parameter names is ambiguous. The durable worker
-- contract matches save_progressive_lesson_group: request id, worker token, group,
-- then payload/reason.

drop function if exists public.invalidate_progressive_lesson_group(uuid, text, text, uuid);

create or replace function public.invalidate_progressive_lesson_group(
  p_request_id uuid,
  p_worker_token uuid,
  p_group text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.progressive_lesson_drafts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_group is null or p_group not in (
    'vocabulary_and_kanji',
    'grammar_and_reading',
    'listening_and_speaking'
  ) then
    raise exception 'Unknown activity group' using errcode = '22023';
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
  returning * into v_job;

  if not found then
    raise exception 'Generation job is no longer claimed' using errcode = '40001';
  end if;

  return to_jsonb(v_job);
end;
$$;

-- Durable-worker RPC: service role only, with an in-function role check as defense
-- in depth if grants drift in a future migration.
revoke all on function public.invalidate_progressive_lesson_group(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.invalidate_progressive_lesson_group(uuid, uuid, text, text)
  to service_role;

-- Fail fast if another overload, retired final-review contract, or ACL drift remains.
do $$
declare
  v_function oid := to_regprocedure(
    'public.invalidate_progressive_lesson_group(uuid,uuid,text,text)'
  );
  v_definition text;
  v_overload_count integer;
begin
  select count(*)
  into v_overload_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'invalidate_progressive_lesson_group';

  if v_overload_count <> 1 then
    raise exception 'Expected exactly one invalidate_progressive_lesson_group overload, found %',
      v_overload_count;
  end if;

  if v_function is null then
    raise exception 'Canonical invalidate_progressive_lesson_group function is missing';
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
