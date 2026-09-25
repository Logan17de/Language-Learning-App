-- A learner may deliberately skip one whole lesson section. The existing
-- phase-commit ledger is the durable marker: skipped commits award no mastery
-- evidence and completion scores that phase as zero.

create or replace function public.skip_lesson_phase(
  p_session_id uuid,
  p_phase text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array[
    'story','vocabulary','grammar','reading','listening','speaking'
  ];
  v_phase_index integer;
  v_prior_count integer;
  v_completed text[] := '{}'::text[];
  v_skipped text[] := '{}'::text[];
  v_next_phase text;
  v_next_index integer;
  v_state jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_phase is null or not (p_phase = any(v_phase_order)) then
    raise exception 'Unsupported lesson phase' using errcode = '22023';
  end if;

  select * into v_session
  from public.lesson_sessions
  where id = p_session_id
    and user_id = auth.uid()
  for update;

  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  if v_session.current_phase <> p_phase then
    raise exception 'Only the current lesson section can be skipped'
      using errcode = '55000';
  end if;

  v_phase_index := array_position(v_phase_order, p_phase) - 1;
  if v_phase_index > 0 then
    select count(*)::integer into v_prior_count
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = any(v_phase_order[1:v_phase_index]);
    if v_prior_count <> v_phase_index then
      raise exception 'Previous lesson phase is not committed' using errcode = '55000';
    end if;
  end if;

  insert into public.lesson_phase_mastery_commits (
    lesson_session_id,
    user_id,
    phase,
    mastery_event_count,
    commit_source
  ) values (
    p_session_id,
    v_session.user_id,
    p_phase,
    0,
    'skipped'
  ) on conflict (lesson_session_id, phase) do nothing;

  select
    coalesce(
      array_agg(commit.phase order by array_position(v_phase_order, commit.phase)),
      '{}'::text[]
    ),
    coalesce(
      array_agg(commit.phase order by array_position(v_phase_order, commit.phase))
        filter (where commit.commit_source = 'skipped'),
      '{}'::text[]
    )
  into v_completed, v_skipped
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id;

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;

  if v_phase_index < array_length(v_phase_order, 1) - 1 then
    v_next_index := v_phase_index + 1;
    v_next_phase := v_phase_order[v_next_index + 1];
  else
    v_next_index := v_phase_index;
    v_next_phase := null;
  end if;

  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{skippedPhaseIds}', to_jsonb(v_skipped), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);
  v_state := jsonb_set(
    v_state,
    '{completionState}',
    to_jsonb(case when v_next_phase is null then 'completion_pending' else 'active' end::text),
    true
  );
  if v_next_phase is not null then
    v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_next_index), true);
  end if;

  update public.lesson_sessions
  set current_phase = coalesce(v_next_phase, p_phase),
      current_phase_index = v_next_index,
      activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint, '{}'::jsonb), '{session}', v_state, true),
      last_saved_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'committed', true,
    'phase', p_phase,
    'skipped', p_phase = any(v_skipped),
    'masteryEventCount', 0,
    'completedPhaseIds', to_jsonb(v_completed),
    'skippedPhaseIds', to_jsonb(v_skipped),
    'nextPhase', v_next_phase,
    'completionPending', v_next_phase is null
  );
end;
$$;

revoke all on function public.skip_lesson_phase(uuid, text)
  from public, anon;
grant execute on function public.skip_lesson_phase(uuid, text)
  to authenticated;

-- Patch the canonical completion engine without duplicating its large,
-- security-sensitive scoring body. Every replacement is guarded so a future
-- upstream edit fails this migration instead of silently weakening a gate.
do $$
declare
  v_definition text;
  v_next text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_lesson_session'
    and pg_get_function_identity_arguments(p.oid) =
      'p_session_id uuid, p_score integer, p_xp integer, p_duration_minutes integer, p_completion_data jsonb';

  if v_definition is null then
    raise exception 'complete_lesson_session(...) is required';
  end if;

  v_next := replace(v_definition,
    '  v_checkpoint := v_session.checkpoint -> ''session'';',
    '  if (select count(*) from public.lesson_phase_mastery_commits commit where commit.lesson_session_id = p_session_id) <> 6 then
    raise exception ''Every lesson section must be completed or skipped'' using errcode = ''55000'';
  end if;

  v_checkpoint := v_session.checkpoint -> ''session'';');
  if v_next = v_definition then raise exception 'completion phase-ledger gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  if jsonb_typeof(v_checkpoint) <> ''object''
     or coalesce((v_checkpoint ->> ''storyComplete'')::boolean, false) is not true then',
    '  if not exists (
       select 1 from public.lesson_phase_mastery_commits commit
       where commit.lesson_session_id = p_session_id
         and commit.phase = ''story''
         and commit.commit_source = ''skipped''
     ) and (
       jsonb_typeof(v_checkpoint) <> ''object''
       or coalesce((v_checkpoint ->> ''storyComplete'')::boolean, false) is not true
     ) then');
  if v_next = v_definition then raise exception 'story completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  with playable as (
    select activity.*
    from public.lesson_practice_activities activity
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = ''vocabulary''',
    '  if exists (
    select 1 from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = ''story''
      and commit.commit_source = ''skipped''
  ) then
    v_story_pct := 0;
  end if;

  with playable as (
    select activity.*
    from public.lesson_practice_activities activity
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = ''vocabulary''');
  if v_next = v_definition then raise exception 'story zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  if v_vocab_total <> 7 or v_vocab_answered <> 7 then',
    '  if not exists (
       select 1 from public.lesson_phase_mastery_commits commit
       where commit.lesson_session_id = p_session_id
         and commit.phase = ''vocabulary''
         and commit.commit_source = ''skipped''
     ) and (v_vocab_total <> 7 or v_vocab_answered <> 7) then');
  if v_next = v_definition then raise exception 'vocabulary completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  v_vocab_pct := 100::numeric * v_vocab_correct / 7;',
    '  v_vocab_pct := 100::numeric * v_vocab_correct / 7;
  if exists (
    select 1 from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = ''vocabulary''
      and commit.commit_source = ''skipped''
  ) then
    v_vocab_pct := 0;
  end if;');
  if v_next = v_definition then raise exception 'vocabulary zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  if v_grammar_static_total <> 7 or v_grammar_static_answered <> 7 then',
    '  if not exists (
       select 1 from public.lesson_phase_mastery_commits commit
       where commit.lesson_session_id = p_session_id
         and commit.phase = ''grammar''
         and commit.commit_source = ''skipped''
     ) and (v_grammar_static_total <> 7 or v_grammar_static_answered <> 7) then');
  if v_next = v_definition then raise exception 'grammar completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '    if v_translation_total <> 5 or v_translation_validated <> 5 then',
    '    if not exists (
         select 1 from public.lesson_phase_mastery_commits commit
         where commit.lesson_session_id = p_session_id
           and commit.phase = ''grammar''
           and commit.commit_source = ''skipped''
       ) and (v_translation_total <> 5 or v_translation_validated <> 5) then');
  if v_next = v_definition then raise exception 'translation completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  with playable as (
    select question.*
    from public.lesson_reading_questions question',
    '  if exists (
    select 1 from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = ''grammar''
      and commit.commit_source = ''skipped''
  ) then
    v_grammar_pct := 0;
  end if;

  with playable as (
    select question.*
    from public.lesson_reading_questions question');
  if v_next = v_definition then raise exception 'grammar zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  if v_reading_total <> 5 or v_reading_answered <> 5 then',
    '  if not exists (
       select 1 from public.lesson_phase_mastery_commits commit
       where commit.lesson_session_id = p_session_id
         and commit.phase = ''reading''
         and commit.commit_source = ''skipped''
     ) and (v_reading_total <> 5 or v_reading_answered <> 5) then');
  if v_next = v_definition then raise exception 'reading completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  v_reading_pct := 100::numeric * v_reading_correct / 5;',
    '  v_reading_pct := 100::numeric * v_reading_correct / 5;
  if exists (
    select 1 from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id
      and commit.phase = ''reading''
      and commit.commit_source = ''skipped''
  ) then
    v_reading_pct := 0;
  end if;');
  if v_next = v_definition then raise exception 'reading zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '    if v_listening_total <> 5 or v_listening_answered <> 5 then',
    '    if not exists (
         select 1 from public.lesson_phase_mastery_commits commit
         where commit.lesson_session_id = p_session_id
           and commit.phase = ''listening''
           and commit.commit_source = ''skipped''
       ) and (v_listening_total <> 5 or v_listening_answered <> 5) then');
  if v_next = v_definition then raise exception 'listening completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '    v_listening_pct := 100::numeric * v_listening_correct / 5;',
    '    v_listening_pct := 100::numeric * v_listening_correct / 5;
    if exists (
      select 1 from public.lesson_phase_mastery_commits commit
      where commit.lesson_session_id = p_session_id
        and commit.phase = ''listening''
        and commit.commit_source = ''skipped''
    ) then
      v_listening_pct := 0;
    end if;');
  if v_next = v_definition then raise exception 'listening zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '    if v_speaking_total <> 5 or v_speaking_validated <> 5 then',
    '    if not exists (
         select 1 from public.lesson_phase_mastery_commits commit
         where commit.lesson_session_id = p_session_id
           and commit.phase = ''speaking''
           and commit.commit_source = ''skipped''
       ) and (v_speaking_total <> 5 or v_speaking_validated <> 5) then');
  if v_next = v_definition then raise exception 'speaking completion gate was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '  end if;

  if v_premium then
    v_score :=',
    '    if exists (
      select 1 from public.lesson_phase_mastery_commits commit
      where commit.lesson_session_id = p_session_id
        and commit.phase = ''speaking''
        and commit.commit_source = ''skipped''
    ) then
      v_speaking_pct := 0;
    end if;
  end if;

  if v_premium then
    v_score :=');
  if v_next = v_definition then raise exception 'speaking zero-score insertion point was not found'; end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    '    ''premiumPhasesIncluded'', v_premium,',
    '    ''premiumPhasesIncluded'', v_premium,
    ''skippedPhases'', (
      select coalesce(jsonb_agg(commit.phase order by commit.committed_at), ''[]''::jsonb)
      from public.lesson_phase_mastery_commits commit
      where commit.lesson_session_id = p_session_id
        and commit.commit_source = ''skipped''
    ),');
  if v_next = v_definition then raise exception 'completion metadata insertion point was not found'; end if;
  v_definition := v_next;

  execute v_definition;
end;
$$;

revoke all on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  from public, anon;
grant execute on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  to authenticated;

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.skip_lesson_phase(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'authenticated must be able to skip lesson phases';
  end if;
  if has_function_privilege('anon', 'public.skip_lesson_phase(uuid,text)', 'EXECUTE') then
    raise exception 'anon must not be able to skip lesson phases';
  end if;
end;
$$;
