-- The client persists the completed phase checkpoint before it asks the
-- canonical mastery RPC to commit that phase. The authoritative checkpoint
-- therefore points at the next section by the time commit_lesson_phase runs.
-- Accept that single-step-ahead state while continuing to reject commits for
-- sections the learner has not reached. Prior-phase ledger checks and the row
-- lock still enforce ordering and idempotency.
do $$
declare
  v_definition text;
  v_original text;
  v_replacement text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'commit_lesson_phase'
    and pg_get_function_identity_arguments(p.oid) =
      'p_session_id uuid, p_phase text';

  if v_definition is null then
    raise exception 'commit_lesson_phase(uuid,text) is required';
  end if;

  v_original := $body$
  if v_session.current_phase <> p_phase then
    raise exception 'Only the current lesson section can be committed' using errcode = '55000';
  end if;$body$;

  v_replacement := $body$
  if array_position(v_phase_order, v_session.current_phase) is null
    or array_position(v_phase_order, v_session.current_phase) - 1 < v_phase_index
    or array_position(v_phase_order, v_session.current_phase) - 1 > v_phase_index + 1
  then
    raise exception 'Only the current or just-completed lesson section can be committed'
      using errcode = '55000';
  end if;$body$;

  v_next := replace(v_definition, v_original, v_replacement);
  if v_next = v_definition then
    raise exception 'current-section commit gate was not found';
  end if;

  execute v_next;
end;
$$;

comment on function public.commit_lesson_phase(uuid, text) is
  'Atomically validates and commits a completed lesson phase. Accepts the phase currently stored on the session or the immediately preceding phase because authoritative checkpoints advance before the mastery commit.';
