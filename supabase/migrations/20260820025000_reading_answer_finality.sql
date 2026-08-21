-- Reading answers become immutable learner evidence.
--
-- Vocabulary, Grammar and Listening answers are already insert-once rows. Reading
-- was the outlier: responses lived only in lesson_sessions.checkpoint, and the
-- checkpoint must stay writable because phase index, activity index and elapsed
-- time all move during a lesson. That meant an already-answered Reading response
-- could still be replaced before the Reading phase committed, and both
-- commit_lesson_phase('reading') and complete_lesson_session() read that mutable
-- value as reward-bearing authority.
--
-- Reading responses now persist as insert-once rows in lesson_activity_answers
-- with phase = 'reading' and activity_id = the reading question id, which the
-- learner RLS already allows and which the browser can no longer update.
-- Correctness is decided in the database by comparing the immutable
-- selected_answer against lesson_reading_questions.answer; a client-supplied
-- `correct` flag is never treated as authority.
--
-- ROLLOUT COMPATIBILITY
-- The promoted old Production client only has Reading answers in its checkpoint.
-- Accepting checkpoint evidence whenever no rows are found would reopen the
-- exploit, because a malicious new client could simply omit the rows. So the
-- checkpoint path is reachable only through commit_reading_phase()'s
-- p_allow_legacy_checkpoint argument, and that function is revoked from
-- public, anon, authenticated and service_role. Only the SECURITY DEFINER
-- legacy checkpoint trigger can pass true. A normal authenticated RPC reaches
-- Reading through commit_lesson_phase(), which always passes false.
--
-- A commit that genuinely used checkpoint evidence is recorded with
-- commit_source = 'legacy_checkpoint', which is what lets final scoring tell a
-- migrated old-client session from a canonical one.
--
-- RESUME
-- Immutable Reading rows do not block the phase-reset contract:
-- reset_incomplete_lesson_phase() already deletes lesson_activity_answers rows
-- for the first uncommitted phase onwards, and it is SECURITY DEFINER, so a
-- discarded Reading attempt is removed through the trusted boundary without the
-- browser ever holding UPDATE or DELETE.

-- ---------------------------------------------------------------------------
-- Canonical Reading scoreboard. Immutable rows first; checkpoint only when the
-- caller is the trusted legacy bridge and no rows exist at all.
-- ---------------------------------------------------------------------------
create or replace function public.reading_phase_scoreboard(
  p_session_id uuid,
  p_allow_legacy_checkpoint boolean,
  out total integer,
  out answered integer,
  out correct integer,
  out source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_state jsonb;
begin
  select * into v_session from public.lesson_sessions where id = p_session_id;
  if not found then
    raise exception 'Lesson session unavailable' using errcode = '42501';
  end if;

  -- Canonical: immutable learner answer rows.
  select count(*)::integer,
         count(answer.selected_answer)::integer,
         count(*) filter (
           where answer.selected_answer is not null
             and btrim(normalize(answer.selected_answer, NFKC))
               = btrim(normalize(question.answer, NFKC))
         )::integer
  into total, answered, correct
  from public.lesson_reading_questions question
  left join public.lesson_activity_answers answer
    on answer.user_id = v_session.user_id
   and answer.lesson_session_id = v_session.id
   and answer.phase = 'reading'
   and answer.activity_id = question.id::text
  where question.lesson_version_id = v_session.lesson_version_id;

  source := 'canonical';

  -- Legacy bridge only: an old-client session has no Reading rows at all and
  -- carries its responses in the checkpoint instead.
  if p_allow_legacy_checkpoint and answered = 0 then
    v_state := case
      when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
        then v_session.checkpoint -> 'session'
      else '{}'::jsonb
    end;

    select count(*)::integer,
           count(response.response)::integer,
           count(*) filter (
             where response.response is not null
               and btrim(normalize(response.response, NFKC))
                 = btrim(normalize(question.answer, NFKC))
           )::integer
    into total, answered, correct
    from public.lesson_reading_questions question
    left join lateral (
      select item ->> 'response' as response
      from jsonb_array_elements(
        case when jsonb_typeof(v_state -> 'readingAnswers') = 'array'
          then v_state -> 'readingAnswers' else '[]'::jsonb end
      ) item
      where item ->> 'questionId' = question.id::text
      limit 1
    ) response on true
    where question.lesson_version_id = v_session.lesson_version_id;

    if answered > 0 then
      source := 'legacy_checkpoint';
    end if;
  end if;
end;
$$;

revoke all on function public.reading_phase_scoreboard(uuid, boolean)
  from public, anon, authenticated, service_role;

comment on function public.reading_phase_scoreboard(uuid, boolean) is
  'Internal. Canonical Reading evidence from immutable answer rows; the mutable checkpoint is reachable only for the trusted legacy bridge.';

-- ---------------------------------------------------------------------------
-- The Reading phase engine. Internal: only commit_lesson_phase() and the
-- legacy checkpoint trigger may call it, and only the trigger passes true.
-- ---------------------------------------------------------------------------
create or replace function public.commit_reading_phase(
  p_session_id uuid,
  p_allow_legacy_checkpoint boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_prior_count integer;
  v_board record;
  v_events jsonb := '[]'::jsonb;
  v_event_count integer := 0;
  v_state jsonb;
  v_completed text[] := '{}'::text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_session
  from public.lesson_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;

  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  -- Idempotent: a repeated commit reports itself and pays out nothing further.
  if exists (
    select 1 from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id and commit.phase = 'reading'
  ) then
    select coalesce(array_agg(commit.phase order by array_position(v_phase_order, commit.phase)), '{}'::text[])
    into v_completed
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id;
    return jsonb_build_object(
      'committed', true, 'duplicate', true, 'phase', 'reading',
      'completedPhaseIds', to_jsonb(v_completed)
    );
  end if;

  select count(*)::integer into v_prior_count
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id
    and commit.phase = any(array['story','vocabulary','grammar']);
  if v_prior_count <> 3 then
    raise exception 'Previous lesson phase is not committed' using errcode = '55000';
  end if;

  select * into v_board
  from public.reading_phase_scoreboard(p_session_id, p_allow_legacy_checkpoint);

  if v_board.total = 0 or v_board.answered <> v_board.total then
    raise exception 'Reading phase is incomplete' using errcode = '55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'clientEventId', 'canonical:reading:' || target.item_id::text,
    'itemType', public.canonical_mastery_item_type(target.item_id),
    'itemKey', target.item_id::text,
    'dimension', case
      when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
      else 'meaning' end,
    'signal', case when v_board.correct = v_board.total then 'correct' else 'incorrect' end,
    'data', jsonb_build_object(
      'source','canonical_phase','phase','reading',
      'correctAnswers', v_board.correct, 'totalAnswers', v_board.total,
      'evidenceSource', v_board.source
    )
  )), '[]'::jsonb)
  into v_events
  from (
    select distinct target_id as item_id
    from public.lesson_reading_sections section
    cross join lateral unnest(section.target_item_ids) target(target_id)
    where section.lesson_version_id = v_session.lesson_version_id
  ) target
  where public.canonical_mastery_item_type(target.item_id) is not null;

  v_event_count := jsonb_array_length(v_events);
  if v_event_count > 0 then
    perform public.apply_canonical_mastery_evidence(p_session_id, v_events);
  end if;

  insert into public.lesson_phase_mastery_commits (
    lesson_session_id, user_id, phase, mastery_event_count, commit_source
  ) values (
    p_session_id, v_session.user_id, 'reading', v_event_count,
    case when v_board.source = 'legacy_checkpoint' then 'legacy_checkpoint' else 'canonical' end
  );

  select coalesce(array_agg(commit.phase order by array_position(v_phase_order, commit.phase)), '{}'::text[])
  into v_completed
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id;

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;
  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);

  update public.lesson_sessions
  set checkpoint = jsonb_set(
        case when jsonb_typeof(checkpoint) = 'object' then checkpoint else '{}'::jsonb end,
        '{session}', v_state, true),
      current_phase = 'listening',
      current_phase_index = 4,
      activity_index = 0,
      last_saved_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'committed', true, 'duplicate', false, 'phase', 'reading',
    'masteryEventCount', v_event_count,
    'evidenceSource', v_board.source,
    'completedPhaseIds', to_jsonb(v_completed)
  );
end;
$$;

revoke all on function public.commit_reading_phase(uuid, boolean)
  from public, anon, authenticated, service_role;

comment on function public.commit_reading_phase(uuid, boolean) is
  'Internal Reading phase engine. Only the legacy checkpoint trigger may pass p_allow_legacy_checkpoint = true; commit_lesson_phase() always passes false.';

-- ---------------------------------------------------------------------------
-- Route the learner-facing RPC through the canonical Reading path.
-- ---------------------------------------------------------------------------
do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid)
  into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'commit_lesson_phase'
    and pg_get_function_identity_arguments(p.oid) = 'p_session_id uuid, p_phase text';

  if v_definition is null then
    raise exception 'commit_lesson_phase(uuid,text) is required';
  end if;

  v_definition := replace(
    v_definition,
    'if p_phase not in (''vocabulary'',''grammar'') then
    return public.commit_lesson_phase_strict_v1(p_session_id, p_phase);
  end if;',
    'if p_phase = ''reading'' then
    return public.commit_reading_phase(p_session_id, false);
  end if;
  if p_phase not in (''vocabulary'',''grammar'') then
    return public.commit_lesson_phase_strict_v1(p_session_id, p_phase);
  end if;'
  );

  if v_definition not like '%commit_reading_phase(p_session_id, false)%' then
    raise exception 'commit_lesson_phase could not be routed to the canonical Reading engine';
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.commit_lesson_phase(uuid, text) from public, anon;
grant execute on function public.commit_lesson_phase(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The legacy checkpoint bridge keeps working for in-flight old-client lessons.
-- ---------------------------------------------------------------------------
create or replace function public.commit_legacy_checkpoint_phases()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_completed jsonb;
  v_phase text;
begin
  if pg_trigger_depth() > 1
     or auth.uid() is null
     or new.status <> 'active' then
    return new;
  end if;

  v_completed := case
    when jsonb_typeof(new.checkpoint -> 'session' -> 'completedPhaseIds') = 'array'
      then new.checkpoint -> 'session' -> 'completedPhaseIds'
    else '[]'::jsonb
  end;

  if v_completed = '[]'::jsonb then
    return new;
  end if;

  foreach v_phase in array v_phase_order loop
    if v_completed ? v_phase
       and not exists (
         select 1
         from public.lesson_phase_mastery_commits commit
         where commit.lesson_session_id = new.id
           and commit.phase = v_phase
       ) then
      if v_phase = 'reading' then
        -- Only this trusted path may fall back to checkpoint Reading evidence.
        perform public.commit_reading_phase(new.id, true);
      else
        perform public.commit_lesson_phase(new.id, v_phase);
      end if;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.commit_legacy_checkpoint_phases()
  from public, anon, authenticated, service_role;

drop trigger if exists lesson_sessions_legacy_phase_commit on public.lesson_sessions;
create trigger lesson_sessions_legacy_phase_commit
after update of checkpoint on public.lesson_sessions
for each row
when (old.checkpoint is distinct from new.checkpoint)
execute function public.commit_legacy_checkpoint_phases();

-- ---------------------------------------------------------------------------
-- Final scoring follows the same rule: immutable rows for a canonical Reading
-- phase, checkpoint only when the commit itself is recorded as legacy.
-- ---------------------------------------------------------------------------
do $$
declare
  v_definition text;
  v_old constant text := '  into v_reading_total, v_reading_answered, v_reading_correct
  from playable question
  left join lateral (
    select item ->> ''response'' as response
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_checkpoint -> ''readingAnswers'') = ''array''
          then v_checkpoint -> ''readingAnswers''
        else ''[]''::jsonb
      end
    ) item
    where item ->> ''questionId'' = question.id::text
    limit 1
  ) answer on true;';
  v_new constant text := '  into v_reading_total, v_reading_answered, v_reading_correct
  from playable question
  left join lateral (
    select case
      when exists (
        select 1 from public.lesson_phase_mastery_commits commit
        where commit.lesson_session_id = p_session_id
          and commit.phase = ''reading''
          and commit.commit_source = ''legacy_checkpoint''
      ) then (
        select item ->> ''response''
        from jsonb_array_elements(
          case
            when jsonb_typeof(v_checkpoint -> ''readingAnswers'') = ''array''
              then v_checkpoint -> ''readingAnswers''
            else ''[]''::jsonb
          end
        ) item
        where item ->> ''questionId'' = question.id::text
        limit 1
      )
      else (
        select immutable_answer.selected_answer
        from public.lesson_activity_answers immutable_answer
        where immutable_answer.lesson_session_id = p_session_id
          and immutable_answer.phase = ''reading''
          and immutable_answer.activity_id = question.id::text
        limit 1
      )
    end as response
  ) answer on true;';
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

  if position(v_old in v_definition) = 0 then
    raise exception 'the Reading scoring block of complete_lesson_session was not found';
  end if;

  v_definition := replace(v_definition, v_old, v_new);

  if v_definition not like '%immutable_answer.selected_answer%' then
    raise exception 'complete_lesson_session was not switched to immutable Reading evidence';
  end if;

  execute v_definition;
end;
$$;

revoke all on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  from public, anon;
grant execute on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Fail the migration if the boundary did not hold.
-- ---------------------------------------------------------------------------
do $$
begin
  if has_function_privilege('authenticated', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE')
     or has_function_privilege('service_role', 'public.commit_reading_phase(uuid, boolean)', 'EXECUTE') then
    raise exception 'the legacy Reading fallback must not be callable outside the trusted bridge';
  end if;

  if has_function_privilege('authenticated', 'public.reading_phase_scoreboard(uuid, boolean)', 'EXECUTE') then
    raise exception 'the Reading scoreboard must not be callable by learners';
  end if;

  if not has_function_privilege('authenticated', 'public.commit_lesson_phase(uuid, text)', 'EXECUTE') then
    raise exception 'learners must still be able to commit a lesson phase';
  end if;

  if has_table_privilege('authenticated', 'public.lesson_activity_answers', 'UPDATE')
     or has_table_privilege('authenticated', 'public.lesson_activity_answers', 'DELETE') then
    raise exception 'Reading answers must remain immutable to the browser role';
  end if;
end;
$$;
