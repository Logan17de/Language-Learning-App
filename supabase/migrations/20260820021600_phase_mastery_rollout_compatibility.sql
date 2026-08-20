-- Close the rollout and historical-data gaps in the phase-atomic mastery engine.
--
-- 1. Older Production clients still call record_mastery_evidence() and then save
--    a checkpoint whose completedPhaseIds already contains the finished phase.
--    The retired RPC stays a no-op, but an AFTER-checkpoint compatibility hook
--    canonically commits any newly completed legacy phase. This preserves mastery
--    earning and creates the commit rows used by the new resume engine.
-- 2. Historical lesson versions can store 10/13 practice rows while the playable
--    learner contract intentionally completes exactly 7 Vocabulary and 7 Grammar
--    activities. Canonical validation therefore validates the seven persisted,
--    version-owned answers actually completed by the learner instead of requiring
--    every historical storage row.
-- 3. Mastery tables and the immutable evidence ledger are read-only to learners.

-- Keep the original implementation for Story/Reading/Listening/Speaking. The
-- wrapper below replaces only Vocabulary/Grammar validation where historical
-- storage can exceed the current seven-activity playable contract.
alter function public.commit_lesson_phase(uuid, text)
  rename to commit_lesson_phase_strict_v1;
revoke all on function public.commit_lesson_phase_strict_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.commit_lesson_phase(
  p_session_id uuid,
  p_phase text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_phase_index integer;
  v_prior_count integer;
  v_answered integer := 0;
  v_translation_total integer := 0;
  v_translation_validated integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_event_count integer := 0;
  v_offset integer := 0;
  v_state jsonb;
  v_completed text[] := '{}'::text[];
  v_next_phase text;
  v_next_index integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_phase is null or not (p_phase = any(v_phase_order)) then
    raise exception 'Unsupported lesson phase' using errcode = '22023';
  end if;

  -- The original canonical implementation remains authoritative for phases
  -- whose stored activity count already matches the playable contract.
  if p_phase not in ('vocabulary','grammar') then
    return public.commit_lesson_phase_strict_v1(p_session_id, p_phase);
  end if;

  select *
  into v_session
  from public.lesson_sessions
  where id = p_session_id
    and user_id = auth.uid()
  for update;

  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.lesson_phase_mastery_commits
    where lesson_session_id = p_session_id
      and phase = p_phase
  ) then
    select coalesce(
      array_agg(commit.phase order by array_position(v_phase_order, commit.phase)),
      '{}'::text[]
    )
    into v_completed
    from public.lesson_phase_mastery_commits commit
    where commit.lesson_session_id = p_session_id;

    return jsonb_build_object(
      'committed', true,
      'duplicate', true,
      'phase', p_phase,
      'completedPhaseIds', to_jsonb(v_completed)
    );
  end if;

  v_phase_index := array_position(v_phase_order, p_phase) - 1;
  select count(*)::integer
  into v_prior_count
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id
    and commit.phase = any(v_phase_order[1:v_phase_index]);

  if v_prior_count <> v_phase_index then
    raise exception 'Previous lesson phase is not committed' using errcode = '55000';
  end if;

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;

  if p_phase = 'vocabulary' then
    -- Current learner contract: exactly seven unique, version-owned Vocabulary
    -- activities are completed. Historical extra storage rows are intentionally
    -- ignored unless the learner actually answered them.
    select count(distinct activity.id)::integer
    into v_answered
    from public.lesson_practice_activities activity
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'vocabulary'
     and answer.activity_id = activity.id::text
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'vocabulary';

    if v_answered <> 7 then
      raise exception 'Vocabulary phase requires exactly 7 completed lesson activities; found %', v_answered
        using errcode = '55000';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'clientEventId', 'canonical:vocabulary:' || activity.id::text || ':' || target.item_id::text,
          'itemType', public.canonical_mastery_item_type(target.item_id),
          'itemKey', target.item_id::text,
          'dimension', case
            when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
            when activity.mode = 'reading-meaning' then 'meaning'
            else 'recognition'
          end,
          'signal', case
            when public.canonical_lesson_answer_matches(
              answer.selected_answer,
              activity.correct_answer,
              activity.accepted_answers
            ) then 'correct'
            else 'incorrect'
          end,
          'data', jsonb_build_object(
            'source','canonical_phase',
            'phase','vocabulary',
            'activityId',activity.id
          )
        )
      ),
      '[]'::jsonb
    )
    into v_events
    from public.lesson_practice_activities activity
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'vocabulary'
     and answer.activity_id = activity.id::text
    cross join lateral unnest(activity.target_item_ids) target(item_id)
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'vocabulary'
      and public.canonical_mastery_item_type(target.item_id) is not null;

  else
    -- Same seven-activity contract for standard Grammar practice. The separate
    -- five-question translation section remains server-validated and mandatory.
    select count(distinct activity.id)::integer
    into v_answered
    from public.lesson_practice_activities activity
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = activity.id::text
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'grammar';

    if v_answered <> 7 then
      raise exception 'Grammar phase requires exactly 7 completed lesson activities; found %', v_answered
        using errcode = '55000';
    end if;

    select
      count(*)::integer,
      count(answer.id) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
      )::integer
    into v_translation_total, v_translation_validated
    from public.lesson_translation_questions question
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar_translation'
     and answer.activity_id = question.id::text
    where question.user_id = v_session.user_id
      and question.lesson_session_id = v_session.id
      and question.lesson_id = v_session.lesson_id
      and question.lesson_version_id = v_session.lesson_version_id;

    if v_translation_total <> 5
       or v_translation_validated <> v_translation_total then
      raise exception 'Translation phase evidence is incomplete' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(event_json), '[]'::jsonb)
    into v_events
    from (
      select jsonb_build_object(
        'clientEventId', 'canonical:grammar:static:' || activity.id::text || ':' || target.item_id::text,
        'itemType', public.canonical_mastery_item_type(target.item_id),
        'itemKey', target.item_id::text,
        'dimension', case
          when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
          else 'meaning'
        end,
        'signal', case
          when public.canonical_lesson_answer_matches(
            answer.selected_answer,
            activity.correct_answer,
            activity.accepted_answers
          ) then 'correct'
          else 'incorrect'
        end,
        'data', jsonb_build_object(
          'source','canonical_phase',
          'phase','grammar',
          'activityId',activity.id
        )
      ) event_json
      from public.lesson_practice_activities activity
      join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase = 'grammar'
       and answer.activity_id = activity.id::text
      cross join lateral unnest(activity.target_item_ids) target(item_id)
      where activity.lesson_version_id = v_session.lesson_version_id
        and activity.phase = 'grammar'
        and public.canonical_mastery_item_type(target.item_id) is not null

      union all

      select jsonb_build_object(
        'clientEventId', 'canonical:grammar:translation:' || question.id::text || ':' || question.target_item_id::text,
        'itemType', public.canonical_mastery_item_type(question.target_item_id),
        'itemKey', question.target_item_id::text,
        'dimension', 'recognition',
        'signal', case when answer.correct then 'correct' else 'incorrect' end,
        'data', jsonb_build_object(
          'source','canonical_phase',
          'phase','grammar',
          'translationQuestionId',question.id,
          'serverValidated',true
        )
      )
      from public.lesson_translation_questions question
      join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase = 'grammar_translation'
       and answer.activity_id = question.id::text
       and coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
      where question.user_id = v_session.user_id
        and question.lesson_session_id = v_session.id
        and question.lesson_id = v_session.lesson_id
        and question.lesson_version_id = v_session.lesson_version_id
        and public.canonical_mastery_item_type(question.target_item_id) is not null
    ) evidence;
  end if;

  v_event_count := jsonb_array_length(v_events);
  while v_offset < v_event_count loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into v_batch
    from jsonb_array_elements(v_events) with ordinality item(value, ordinality)
    where ordinality > v_offset
      and ordinality <= v_offset + 100;

    perform public.apply_canonical_mastery_evidence(p_session_id, v_batch);
    v_offset := v_offset + 100;
  end loop;

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
    v_event_count,
    'canonical'
  );

  select coalesce(
    array_agg(commit.phase order by array_position(v_phase_order, commit.phase)),
    '{}'::text[]
  )
  into v_completed
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id;

  v_next_index := v_phase_index + 1;
  v_next_phase := v_phase_order[v_next_index + 1];

  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionState}', to_jsonb('active'::text), true);
  v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_next_index), true);

  update public.lesson_sessions
  set current_phase = v_next_phase,
      current_phase_index = v_next_index,
      activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint, '{}'::jsonb), '{session}', v_state, true),
      last_saved_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'committed', true,
    'duplicate', false,
    'phase', p_phase,
    'masteryEventCount', v_event_count,
    'completedPhaseIds', to_jsonb(v_completed),
    'nextPhase', v_next_phase,
    'completionPending', false
  );
end;
$$;

revoke all on function public.commit_lesson_phase(uuid, text) from public, anon;
grant execute on function public.commit_lesson_phase(uuid, text) to authenticated;

-- Compatibility bridge for the old Production client. Old code first persists
-- answers/events, then writes a checkpoint with the just-finished phase already
-- in completedPhaseIds. New code does not add the phase until after the explicit
-- commit RPC succeeds, so this hook stays inert on the new path.
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
      perform public.commit_lesson_phase(new.id, v_phase);
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

-- Learners can inspect their mastery history but cannot mutate either the
-- aggregate rows or the immutable evidence ledger directly. Revoking ALL also
-- closes TRUNCATE/TRIGGER privileges left behind by historical blanket grants.
revoke all on public.learner_mastery from authenticated;
grant select on public.learner_mastery to authenticated;
revoke all on public.learner_mastery_events from authenticated;
grant select on public.learner_mastery_events to authenticated;

-- review_queue intentionally remains unchanged here. Its current Quick Review
-- workflow mutates scheduling state through review-specific functions; changing
-- that authorization belongs to the review security boundary, not /learn.

-- Migration-level rollout guardrails.
do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.commit_lesson_phase_strict_v1(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Strict internal phase engine is exposed to authenticated';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.commit_lesson_phase(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'Authenticated learner cannot commit a validated phase';
  end if;

  if has_table_privilege('authenticated','public.learner_mastery','INSERT')
     or has_table_privilege('authenticated','public.learner_mastery','UPDATE')
     or has_table_privilege('authenticated','public.learner_mastery','DELETE')
     or has_table_privilege('authenticated','public.learner_mastery','TRUNCATE') then
    raise exception 'Learner mastery aggregate remains mutable';
  end if;

  if has_table_privilege('authenticated','public.learner_mastery_events','INSERT')
     or has_table_privilege('authenticated','public.learner_mastery_events','UPDATE')
     or has_table_privilege('authenticated','public.learner_mastery_events','DELETE')
     or has_table_privilege('authenticated','public.learner_mastery_events','TRUNCATE') then
    raise exception 'Learner mastery event ledger remains mutable';
  end if;
end;
$$;