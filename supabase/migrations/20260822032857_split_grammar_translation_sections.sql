-- Grammar recognition and Translation production are separate durable lesson
-- boundaries. A learner who leaves Translation resumes at Translation without
-- losing the already committed Grammar section.

alter function public.commit_lesson_phase(uuid, text)
  rename to commit_lesson_phase_six_phase_v1;
revoke all on function public.commit_lesson_phase_six_phase_v1(uuid, text)
  from public, anon, authenticated, service_role;

create or replace function public.set_lesson_seven_phase_boundary(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array[
    'story','vocabulary','grammar','translation','reading','listening','speaking'
  ];
  v_completed text[] := '{}'::text[];
  v_skipped text[] := '{}'::text[];
  v_next_phase text;
  v_next_index integer := 0;
  v_state jsonb;
  v_i integer;
begin
  select * into v_session
  from public.lesson_sessions
  where id = p_session_id
  for update;
  if not found then
    raise exception 'Lesson session unavailable' using errcode = 'P0002';
  end if;

  select
    coalesce(array_agg(c.phase order by array_position(v_phase_order, c.phase)), '{}'::text[]),
    coalesce(array_agg(c.phase order by array_position(v_phase_order, c.phase))
      filter (where c.commit_source = 'skipped'), '{}'::text[])
  into v_completed, v_skipped
  from public.lesson_phase_mastery_commits c
  where c.lesson_session_id = p_session_id
    and c.phase = any(v_phase_order);

  for v_i in 1..array_length(v_phase_order, 1) loop
    if not (v_phase_order[v_i] = any(v_completed)) then
      v_next_phase := v_phase_order[v_i];
      v_next_index := v_i - 1;
      exit;
    end if;
  end loop;
  if v_next_phase is null then
    v_next_phase := 'speaking';
    v_next_index := 6;
  end if;

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;
  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{skippedPhaseIds}', to_jsonb(v_skipped), true);
  v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_next_index), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);
  v_state := jsonb_set(
    v_state,
    '{completionState}',
    to_jsonb(case when cardinality(v_completed) = 7 then 'completion_pending' else 'active' end::text),
    true
  );

  update public.lesson_sessions
  set current_phase = v_next_phase,
      current_phase_index = v_next_index,
      activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint, '{}'::jsonb), '{session}', v_state, true),
      last_saved_at = now(),
      updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'completedPhaseIds', to_jsonb(v_completed),
    'skippedPhaseIds', to_jsonb(v_skipped),
    'nextPhase', case when cardinality(v_completed) = 7 then null else v_next_phase end,
    'nextPhaseIndex', v_next_index,
    'completionPending', cardinality(v_completed) = 7
  );
end;
$$;
revoke all on function public.set_lesson_seven_phase_boundary(uuid)
  from public, anon, authenticated, service_role;

-- Old Grammar commits represented both Grammar and Translation. Split those
-- durable rows before changing active-session indexes so no existing learner
-- is sent backward to a section they already finished.
insert into public.lesson_phase_mastery_commits(
  lesson_session_id, user_id, phase, mastery_event_count, commit_source
)
select
  grammar.lesson_session_id,
  grammar.user_id,
  'translation',
  0,
  case
    when grammar.commit_source = 'skipped'
      or (profile.subscription_plan = 'free'
        and profile.role not in ('admin','content_editor'))
      then 'skipped'
    else 'legacy_checkpoint'
  end
from public.lesson_phase_mastery_commits grammar
join public.lesson_sessions session on session.id = grammar.lesson_session_id
join public.profiles profile on profile.id = grammar.user_id
where grammar.phase = 'grammar'
  and session.status = 'active'
  and not exists (
    select 1 from public.lesson_phase_mastery_commits translation
    where translation.lesson_session_id = grammar.lesson_session_id
      and translation.phase = 'translation'
  )
on conflict (lesson_session_id, phase) do nothing;

do $$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select id from public.lesson_sessions where status = 'active' order by id
  loop
    perform public.set_lesson_seven_phase_boundary(v_session_id);
  end loop;
end;
$$;

create or replace function public.commit_lesson_phase(
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
  v_profile public.profiles%rowtype;
  v_phase_order constant text[] := array[
    'story','vocabulary','grammar','translation','reading','listening','speaking'
  ];
  v_phase_index integer;
  v_prior_count integer;
  v_playable_total integer := 0;
  v_answered integer := 0;
  v_translation_total integer := 0;
  v_translation_validated integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_event_count integer := 0;
  v_offset integer := 0;
  v_boundary jsonb;
  v_result jsonb;
  v_premium boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_phase is null or not (p_phase = any(v_phase_order)) then
    raise exception 'Unsupported lesson phase' using errcode = '22023';
  end if;

  select * into v_session
  from public.lesson_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;
  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.lesson_phase_mastery_commits c
    where c.lesson_session_id = p_session_id and c.phase = p_phase
  ) then
    v_boundary := public.set_lesson_seven_phase_boundary(p_session_id);
    return jsonb_build_object(
      'committed', true, 'duplicate', true, 'phase', p_phase,
      'completedPhaseIds', v_boundary -> 'completedPhaseIds',
      'nextPhase', v_boundary -> 'nextPhase',
      'completionPending', (v_boundary ->> 'completionPending')::boolean
    );
  end if;

  v_phase_index := array_position(v_phase_order, p_phase) - 1;
  if v_phase_index > 0 then
    select count(*)::integer into v_prior_count
    from public.lesson_phase_mastery_commits c
    where c.lesson_session_id = p_session_id
      and c.phase = any(v_phase_order[1:v_phase_index]);
    if v_prior_count <> v_phase_index then
      raise exception 'Previous lesson phase is not committed' using errcode = '55000';
    end if;
  end if;
  if v_session.current_phase <> p_phase then
    raise exception 'Only the current lesson section can be committed' using errcode = '55000';
  end if;

  if p_phase not in ('grammar', 'translation') then
    v_result := public.commit_lesson_phase_six_phase_v1(p_session_id, p_phase);
    v_boundary := public.set_lesson_seven_phase_boundary(p_session_id);
    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
      'completedPhaseIds', v_boundary -> 'completedPhaseIds',
      'nextPhase', v_boundary -> 'nextPhase',
      'completionPending', (v_boundary ->> 'completionPending')::boolean
    );
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';
  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;
  v_premium := v_profile.subscription_plan <> 'free'
    or v_profile.role in ('admin','content_editor');

  if p_phase = 'grammar' then
    with playable as (
      select a.* from public.lesson_practice_activities a
      where a.lesson_version_id = v_session.lesson_version_id
        and a.phase = 'grammar'
      order by a.position, a.id limit 7
    )
    select count(*)::integer, count(answer.id)::integer
    into v_playable_total, v_answered
    from playable a
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = a.id::text;
    if v_playable_total <> 7 or v_answered <> 7 then
      raise exception 'Grammar section requires exactly 7 playable answers' using errcode = '55000';
    end if;

    with playable as (
      select a.* from public.lesson_practice_activities a
      where a.lesson_version_id = v_session.lesson_version_id
        and a.phase = 'grammar'
      order by a.position, a.id limit 7
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:grammar:static:' || a.id::text || ':' || target.item_id::text,
      'itemType', public.canonical_mastery_item_type(target.item_id),
      'itemKey', target.item_id::text,
      'dimension', case when public.canonical_mastery_item_type(target.item_id) = 'grammar'
        then 'recognition' else 'meaning' end,
      'signal', case when public.canonical_lesson_answer_matches(
        answer.selected_answer, a.correct_answer, a.accepted_answers
      ) then 'correct' else 'incorrect' end,
      'data', jsonb_build_object('source','canonical_phase','phase','grammar','activityId',a.id)
    )), '[]'::jsonb)
    into v_events
    from playable a
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = a.id::text
    cross join lateral unnest(a.target_item_ids) target(item_id)
    where public.canonical_mastery_item_type(target.item_id) is not null;
  else
    if not v_premium then
      raise exception 'Translation requires premium access or a section skip' using errcode = '42501';
    end if;
    select count(*)::integer,
      count(answer.id) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
      )::integer
    into v_translation_total, v_translation_validated
    from public.lesson_translation_questions q
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar_translation'
     and answer.activity_id = q.id::text
    where q.user_id = v_session.user_id
      and q.lesson_session_id = v_session.id
      and q.lesson_id = v_session.lesson_id
      and q.lesson_version_id = v_session.lesson_version_id;
    if v_translation_total <> 5 or v_translation_validated <> 5 then
      raise exception 'Translation section requires exactly 5 validated answers' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:translation:' || q.id::text || ':' || q.target_item_id::text,
      'itemType', public.canonical_mastery_item_type(q.target_item_id),
      'itemKey', q.target_item_id::text,
      'dimension', 'recognition',
      'signal', case when answer.correct then 'correct' else 'incorrect' end,
      'data', jsonb_build_object(
        'source','canonical_phase','phase','translation',
        'translationQuestionId',q.id,'serverValidated',true
      )
    )), '[]'::jsonb)
    into v_events
    from public.lesson_translation_questions q
    join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar_translation'
     and answer.activity_id = q.id::text
     and coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
    where q.user_id = v_session.user_id
      and q.lesson_session_id = v_session.id
      and q.lesson_id = v_session.lesson_id
      and q.lesson_version_id = v_session.lesson_version_id
      and public.canonical_mastery_item_type(q.target_item_id) is not null;
  end if;

  v_event_count := jsonb_array_length(v_events);
  while v_offset < v_event_count loop
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
    into v_batch
    from jsonb_array_elements(v_events) with ordinality item(value, ordinality)
    where ordinality > v_offset and ordinality <= v_offset + 100;
    perform public.apply_canonical_mastery_evidence(p_session_id, v_batch);
    v_offset := v_offset + 100;
  end loop;

  insert into public.lesson_phase_mastery_commits(
    lesson_session_id, user_id, phase, mastery_event_count, commit_source
  ) values (p_session_id, v_session.user_id, p_phase, v_event_count, 'canonical');

  v_boundary := public.set_lesson_seven_phase_boundary(p_session_id);
  return jsonb_build_object(
    'committed', true, 'duplicate', false, 'phase', p_phase,
    'masteryEventCount', v_event_count,
    'completedPhaseIds', v_boundary -> 'completedPhaseIds',
    'nextPhase', v_boundary -> 'nextPhase',
    'completionPending', (v_boundary ->> 'completionPending')::boolean
  );
end;
$$;
revoke all on function public.commit_lesson_phase(uuid, text) from public, anon;
grant execute on function public.commit_lesson_phase(uuid, text) to authenticated;

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
    'story','vocabulary','grammar','translation','reading','listening','speaking'
  ];
  v_phase_index integer;
  v_prior_count integer;
  v_boundary jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_phase is null or not (p_phase = any(v_phase_order)) then
    raise exception 'Unsupported lesson phase' using errcode = '22023';
  end if;
  select * into v_session
  from public.lesson_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;
  if not found or v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;
  if v_session.current_phase <> p_phase then
    raise exception 'Only the current lesson section can be skipped' using errcode = '55000';
  end if;

  v_phase_index := array_position(v_phase_order, p_phase) - 1;
  if v_phase_index > 0 then
    select count(*)::integer into v_prior_count
    from public.lesson_phase_mastery_commits c
    where c.lesson_session_id = p_session_id
      and c.phase = any(v_phase_order[1:v_phase_index]);
    if v_prior_count <> v_phase_index then
      raise exception 'Previous lesson phase is not committed' using errcode = '55000';
    end if;
  end if;

  insert into public.lesson_phase_mastery_commits(
    lesson_session_id, user_id, phase, mastery_event_count, commit_source
  ) values (p_session_id, v_session.user_id, p_phase, 0, 'skipped')
  on conflict (lesson_session_id, phase) do nothing;

  v_boundary := public.set_lesson_seven_phase_boundary(p_session_id);
  return jsonb_build_object(
    'committed', true, 'phase', p_phase, 'skipped', true,
    'masteryEventCount', 0,
    'completedPhaseIds', v_boundary -> 'completedPhaseIds',
    'skippedPhaseIds', v_boundary -> 'skippedPhaseIds',
    'nextPhase', v_boundary -> 'nextPhase',
    'completionPending', (v_boundary ->> 'completionPending')::boolean
  );
end;
$$;
revoke all on function public.skip_lesson_phase(uuid, text) from public, anon;
grant execute on function public.skip_lesson_phase(uuid, text) to authenticated;

create or replace function public.reset_incomplete_lesson_phase(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array[
    'story','vocabulary','grammar','translation','reading','listening','speaking'
  ];
  v_completed text[] := '{}'::text[];
  v_skipped text[] := '{}'::text[];
  v_index integer := 0;
  v_phase text;
  v_state jsonb;
  v_answers jsonb;
  v_i integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_session
  from public.lesson_sessions
  where id = p_session_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'Lesson session unavailable' using errcode = '42501';
  end if;
  if v_session.status = 'completed' then
    return jsonb_build_object('completed', true, 'checkpoint', v_session.checkpoint);
  end if;
  if v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode = '42501';
  end if;

  select
    coalesce(array_agg(c.phase order by array_position(v_phase_order, c.phase)), '{}'::text[]),
    coalesce(array_agg(c.phase order by array_position(v_phase_order, c.phase))
      filter (where c.commit_source = 'skipped'), '{}'::text[])
  into v_completed, v_skipped
  from public.lesson_phase_mastery_commits c
  where c.lesson_session_id = p_session_id and c.phase = any(v_phase_order);

  for v_i in 1..array_length(v_phase_order, 1) loop
    if not (v_phase_order[v_i] = any(v_completed)) then
      v_index := v_i - 1;
      v_phase := v_phase_order[v_i];
      exit;
    end if;
  end loop;

  v_state := case when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
    then v_session.checkpoint -> 'session' else '{}'::jsonb end;
  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{skippedPhaseIds}', to_jsonb(v_skipped), true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);

  if v_phase is null then
    v_index := 6;
    v_phase := 'speaking';
    v_state := jsonb_set(v_state, '{currentPhaseIndex}', '6'::jsonb, true);
    v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
    v_state := jsonb_set(v_state, '{completionState}', to_jsonb('completion_pending'::text), true);
  else
    delete from public.lesson_activity_answers a
    where a.user_id = v_session.user_id and a.lesson_session_id = p_session_id
      and (
        (v_index <= 1 and a.phase = 'vocabulary') or
        (v_index <= 2 and a.phase = 'grammar') or
        (v_index <= 3 and a.phase = 'grammar_translation') or
        (v_index <= 4 and a.phase = 'reading') or
        (v_index <= 5 and a.phase = 'listening') or
        (v_index <= 6 and a.phase = 'speaking')
      );
    delete from public.lesson_events e
    where e.user_id = v_session.user_id and e.lesson_session_id = p_session_id
      and array_position(v_phase_order, e.phase) is not null
      and array_position(v_phase_order, e.phase) - 1 >= v_index;

    if v_index <= 0 then
      v_state := jsonb_set(v_state, '{storyInteractions}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{storyComplete}', 'false'::jsonb, true);
    end if;
    if v_index <= 1 then
      v_state := jsonb_set(v_state, '{vocabularyAnswers}', '[]'::jsonb, true);
    end if;
    if v_index <= 2 then
      v_state := jsonb_set(v_state, '{grammarAnswers}', '[]'::jsonb, true);
      v_state := v_state - 'grammarTranslationQuestions';
    elsif v_index = 3 then
      select coalesce(jsonb_agg(answer), '[]'::jsonb)
      into v_answers
      from jsonb_array_elements(
        case when jsonb_typeof(v_state -> 'grammarAnswers') = 'array'
          then v_state -> 'grammarAnswers' else '[]'::jsonb end
      ) answer
      where not (answer ? 'validationSource');
      v_state := jsonb_set(v_state, '{grammarAnswers}', v_answers, true);
    end if;
    if v_index <= 4 then
      v_state := jsonb_set(v_state, '{readingAnswers}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{readingEvents}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{readingComplete}', 'false'::jsonb, true);
    end if;
    if v_index <= 5 then
      v_state := jsonb_set(v_state, '{listeningEvents}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{listeningComplete}', 'false'::jsonb, true);
    end if;
    if v_index <= 6 then
      v_state := jsonb_set(v_state, '{speakingEvents}', '[]'::jsonb, true);
      v_state := jsonb_set(v_state, '{speakingComplete}', 'false'::jsonb, true);
    end if;
    for v_i in v_index + 1..7 loop
      v_state := jsonb_set(
        v_state, array['activities', v_phase_order[v_i]],
        jsonb_build_object('phaseId',v_phase_order[v_i],'activityIndex',0,'completed',false,'attempts',0), true
      );
    end loop;
    v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_index), true);
    v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
    v_state := jsonb_set(v_state, '{completionState}', to_jsonb('active'::text), true);
  end if;

  update public.lesson_sessions
  set current_phase = v_phase, current_phase_index = v_index, activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint, '{}'::jsonb), '{session}', v_state, true),
      last_saved_at = now(), updated_at = now()
  where id = p_session_id;

  return jsonb_build_object(
    'completed', false, 'currentPhase', v_phase, 'currentPhaseIndex', v_index,
    'activityIndex', 0, 'completedPhaseIds', to_jsonb(v_completed),
    'checkpoint', jsonb_set(coalesce(v_session.checkpoint, '{}'::jsonb), '{session}', v_state, true),
    'completionPending', cardinality(v_completed) = 7
  );
end;
$$;
revoke all on function public.reset_incomplete_lesson_phase(uuid) from public, anon;
grant execute on function public.reset_incomplete_lesson_phase(uuid) to authenticated;

-- The completion engine keeps the existing scoring weights, but now requires
-- seven durable section rows and scores Grammar/Translation skip markers
-- independently.
do $$
declare
  v_definition text;
  v_next text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_lesson_session'
    and pg_get_function_identity_arguments(p.oid) =
      'p_session_id uuid, p_score integer, p_xp integer, p_duration_minutes integer, p_completion_data jsonb';
  if v_definition is null then
    raise exception 'complete_lesson_session(...) is required';
  end if;

  v_next := replace(v_definition,
    ') <> 6 then
    raise exception ''Every lesson section must be completed or skipped''',
    ') <> 7 then
    raise exception ''Every lesson section must be completed or skipped''');
  if v_next = v_definition then
    raise exception 'Six-section completion ledger gate was not found';
  end if;
  v_definition := v_next;

  v_next := replace(v_definition,
    'and commit.phase = ''grammar''
           and commit.commit_source = ''skipped''
       ) and (v_translation_total <> 5 or v_translation_validated <> 5) then',
    'and commit.phase = ''translation''
           and commit.commit_source = ''skipped''
       ) and (v_translation_total <> 5 or v_translation_validated <> 5) then');
  if v_next = v_definition then
    raise exception 'Translation skip completion gate was not found';
  end if;
  v_definition := v_next;

  v_next := replace(v_definition,
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
    from public.lesson_reading_questions question',
    '  if v_premium then
    if exists (
      select 1 from public.lesson_phase_mastery_commits commit
      where commit.lesson_session_id = p_session_id
        and commit.phase = ''grammar''
        and commit.commit_source = ''skipped''
    ) then
      v_grammar_static_correct := 0;
    end if;
    if exists (
      select 1 from public.lesson_phase_mastery_commits commit
      where commit.lesson_session_id = p_session_id
        and commit.phase = ''translation''
        and commit.commit_source = ''skipped''
    ) then
      v_translation_correct := 0;
    end if;
    v_grammar_pct := 100::numeric
      * (v_grammar_static_correct + v_translation_correct) / 12;
  elsif exists (
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
  if v_next = v_definition then
    raise exception 'Combined Grammar skip scoring block was not found';
  end if;
  v_definition := v_next;

  execute v_definition;
end;
$$;

revoke all on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  from public, anon;
grant execute on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb)
  to authenticated;

-- Keep cached clients safe if they restore from completedPhaseIds during the
-- deployment window. The learner-facing commit RPC remains the authority.
create or replace function public.commit_legacy_checkpoint_phases()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phase_order constant text[] := array[
    'story','vocabulary','grammar','translation','reading','listening','speaking'
  ];
  v_completed jsonb;
  v_phase text;
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or new.status <> 'active' then
    return new;
  end if;
  v_completed := case
    when jsonb_typeof(new.checkpoint -> 'session' -> 'completedPhaseIds') = 'array'
      then new.checkpoint -> 'session' -> 'completedPhaseIds'
    else '[]'::jsonb
  end;
  foreach v_phase in array v_phase_order loop
    if v_completed ? v_phase and not exists (
      select 1 from public.lesson_phase_mastery_commits c
      where c.lesson_session_id = new.id and c.phase = v_phase
    ) then
      if v_phase = 'reading' then
        if exists (
          select 1 from public.lesson_legacy_checkpoint_sessions legacy
          where legacy.lesson_session_id = new.id
        ) then
          perform public.commit_reading_phase(new.id, true);
        end if;
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

do $$
begin
  if not has_function_privilege('authenticated', 'public.commit_lesson_phase(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.skip_lesson_phase(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reset_incomplete_lesson_phase(uuid)', 'EXECUTE') then
    raise exception 'Authenticated lesson phase RPC privileges are incomplete';
  end if;
  if has_function_privilege('anon', 'public.commit_lesson_phase(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.skip_lesson_phase(uuid,text)', 'EXECUTE') then
    raise exception 'Anonymous lesson phase mutation privilege detected';
  end if;
end;
$$;
