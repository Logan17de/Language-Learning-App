-- Mastery is committed only at a fully validated lesson-phase boundary.
-- Learner-authored checkpoints and answer metadata are never mastery authority.
--
-- Rollout compatibility: keep the historical learner-facing mastery RPC name as
-- a successful no-op so the older production client does not crash while the
-- shared database is ahead of the application. New clients use
-- commit_lesson_phase(), which derives every reward-bearing signal from
-- canonical persisted evidence.

create table public.lesson_phase_mastery_commits (
  id uuid primary key default gen_random_uuid(),
  lesson_session_id uuid not null references public.lesson_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phase text not null check (phase in ('story','vocabulary','grammar','reading','listening','speaking')),
  mastery_event_count integer not null default 0 check (mastery_event_count >= 0),
  commit_source text not null default 'canonical' check (commit_source in ('canonical','skipped','legacy_checkpoint')),
  committed_at timestamptz not null default now(),
  unique (lesson_session_id, phase)
);

alter table public.lesson_phase_mastery_commits enable row level security;
create policy lesson_phase_mastery_commits_own_select
  on public.lesson_phase_mastery_commits for select to authenticated
  using (user_id = auth.uid());
grant select on public.lesson_phase_mastery_commits to authenticated;
revoke insert, update, delete on public.lesson_phase_mastery_commits from authenticated;

-- Preserve the phase boundary of sessions already in flight at rollout time.
-- This does not manufacture new mastery; it only prevents already-completed
-- legacy phases from being replayed and re-awarded by the new engine.
insert into public.lesson_phase_mastery_commits (
  lesson_session_id, user_id, phase, mastery_event_count, commit_source
)
select distinct
  session.id,
  session.user_id,
  phase.value,
  0,
  'legacy_checkpoint'
from public.lesson_sessions session
cross join lateral jsonb_array_elements_text(
  case
    when jsonb_typeof(session.checkpoint -> 'session' -> 'completedPhaseIds') = 'array'
      then session.checkpoint -> 'session' -> 'completedPhaseIds'
    else '[]'::jsonb
  end
) phase(value)
where session.status in ('active','completed')
  and phase.value in ('story','vocabulary','grammar','reading','listening','speaking')
on conflict (lesson_session_id, phase) do nothing;

-- The historical function contains the useful mastery/review update engine,
-- but its JSON input is learner-controlled. Move it behind the canonical phase
-- RPC, then leave a compatibility no-op under the old public name.
alter function public.record_mastery_evidence(uuid, jsonb)
  rename to apply_canonical_mastery_evidence;
revoke all on function public.apply_canonical_mastery_evidence(uuid, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.record_mastery_evidence(
  p_session_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.lesson_sessions
    where id = p_session_id and user_id = auth.uid()
  ) then
    raise exception 'Lesson session unavailable' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'processed', 0,
    'deduplicated', case
      when jsonb_typeof(p_events) = 'array' then jsonb_array_length(p_events)
      else 0
    end,
    'retired', true
  );
end;
$$;
revoke all on function public.record_mastery_evidence(uuid, jsonb) from public, anon;
grant execute on function public.record_mastery_evidence(uuid, jsonb) to authenticated;

-- Mastery rows themselves must also be server-owned. Learners retain reads.
drop policy if exists learner_mastery_own_insert on public.learner_mastery;
drop policy if exists learner_mastery_own_update on public.learner_mastery;
revoke insert, update, delete on public.learner_mastery from authenticated;

create or replace function public.canonical_mastery_item_type(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.kanji_records where id = p_item_id and archived_at is null and quality_status <> 'rejected') then 'kanji'
    when exists (select 1 from public.vocabulary_records where id = p_item_id and archived_at is null and quality_status <> 'rejected') then 'vocabulary'
    when exists (select 1 from public.grammar_records where id = p_item_id and archived_at is null and quality_status <> 'rejected') then 'grammar'
    else null
  end
$$;
revoke all on function public.canonical_mastery_item_type(uuid) from public, anon, authenticated, service_role;

create or replace function public.canonical_lesson_answer_matches(
  p_selected text,
  p_correct text,
  p_accepted text[] default '{}'::text[]
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    regexp_replace(normalize(coalesce(p_selected, ''), NFKC), '\s+', '', 'g')
      = regexp_replace(normalize(coalesce(p_correct, ''), NFKC), '\s+', '', 'g')
    or exists (
      select 1
      from unnest(coalesce(p_accepted, '{}'::text[])) accepted(candidate)
      where regexp_replace(normalize(coalesce(p_selected, ''), NFKC), '\s+', '', 'g')
        = regexp_replace(normalize(coalesce(accepted.candidate, ''), NFKC), '\s+', '', 'g')
    )
$$;
revoke all on function public.canonical_lesson_answer_matches(text,text,text[]) from public, anon, authenticated, service_role;

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
  v_profile public.profiles%rowtype;
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_phase_index integer;
  v_prior_count integer;
  v_total integer := 0;
  v_answered integer := 0;
  v_correct integer := 0;
  v_events jsonb := '[]'::jsonb;
  v_batch jsonb;
  v_event_count integer := 0;
  v_offset integer := 0;
  v_premium boolean;
  v_state jsonb;
  v_completed text[] := '{}'::text[];
  v_next_phase text;
  v_next_index integer;
  v_source text := 'canonical';
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
    select 1 from public.lesson_phase_mastery_commits
    where lesson_session_id = p_session_id and phase = p_phase
  ) then
    select coalesce(array_agg(commit.phase order by array_position(v_phase_order, commit.phase)), '{}'::text[])
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

  select * into v_profile from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile unavailable' using errcode = 'P0002'; end if;
  v_premium := v_profile.subscription_plan <> 'free' or v_profile.role in ('admin','content_editor');

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

  v_state := case
    when jsonb_typeof(v_session.checkpoint -> 'session') = 'object'
      then v_session.checkpoint -> 'session'
    else '{}'::jsonb
  end;

  if p_phase = 'story' then
    if coalesce((v_state ->> 'storyComplete')::boolean, false) is not true then
      raise exception 'Story phase is incomplete' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(event_json), '[]'::jsonb)
    into v_events
    from (
      select jsonb_build_object(
        'clientEventId', 'canonical:story:' || event.id::text || ':' || word.library_id::text || ':primary',
        'itemType', word.library_type,
        'itemKey', word.library_id::text,
        'dimension', case when event.event_type = 'meaning-revealed' then 'meaning' else 'recognition' end,
        'signal', case when event.event_type = 'meaning-revealed' then 'revealed_meaning' else 'revealed_reading' end,
        'data', jsonb_build_object('source','canonical_phase','phase','story','storyWordId',word.id)
      ) event_json
      from public.lesson_events event
      join public.lesson_story_words word
        on word.lesson_version_id = v_session.lesson_version_id
       and event.event_data ->> 'lineId' = word.story_line_id::text
       and (
         event.event_data ->> 'wordId' = word.id::text
         or (coalesce(event.event_data ->> 'wordId','') = '' and event.event_data ->> 'term' = word.surface)
       )
      where event.user_id = v_session.user_id
        and event.lesson_session_id = v_session.id
        and event.phase = 'story'
        and event.event_type in ('reading-revealed','meaning-revealed')
        and word.library_id is not null
        and word.library_type in ('kanji','vocabulary')
      union all
      select jsonb_build_object(
        'clientEventId', 'canonical:story:' || event.id::text || ':' || word.library_id::text || ':recognition',
        'itemType', word.library_type,
        'itemKey', word.library_id::text,
        'dimension', 'recognition',
        'signal', 'revealed_meaning',
        'data', jsonb_build_object('source','canonical_phase','phase','story','storyWordId',word.id)
      )
      from public.lesson_events event
      join public.lesson_story_words word
        on word.lesson_version_id = v_session.lesson_version_id
       and event.event_data ->> 'lineId' = word.story_line_id::text
       and (
         event.event_data ->> 'wordId' = word.id::text
         or (coalesce(event.event_data ->> 'wordId','') = '' and event.event_data ->> 'term' = word.surface)
       )
      where event.user_id = v_session.user_id
        and event.lesson_session_id = v_session.id
        and event.phase = 'story'
        and event.event_type = 'meaning-revealed'
        and word.script_type <> 'kanji'
        and word.library_id is not null
        and word.library_type in ('kanji','vocabulary')
    ) evidence;

  elsif p_phase = 'vocabulary' then
    select count(*)::integer, count(answer.id)::integer
    into v_total, v_answered
    from public.lesson_practice_activities activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'vocabulary'
     and answer.activity_id = activity.id::text
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'vocabulary';
    if v_total = 0 or v_answered <> v_total then
      raise exception 'Vocabulary phase is incomplete' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:vocabulary:' || activity.id::text || ':' || target.item_id::text,
      'itemType', public.canonical_mastery_item_type(target.item_id),
      'itemKey', target.item_id::text,
      'dimension', case
        when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition'
        when activity.mode = 'reading-meaning' then 'meaning'
        else 'recognition'
      end,
      'signal', case
        when public.canonical_lesson_answer_matches(answer.selected_answer, activity.correct_answer, activity.accepted_answers)
          then 'correct' else 'incorrect' end,
      'data', jsonb_build_object('source','canonical_phase','phase','vocabulary','activityId',activity.id)
    )), '[]'::jsonb)
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

  elsif p_phase = 'grammar' then
    select count(*)::integer, count(answer.id)::integer
    into v_total, v_answered
    from public.lesson_practice_activities activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'grammar'
     and answer.activity_id = activity.id::text
    where activity.lesson_version_id = v_session.lesson_version_id
      and activity.phase = 'grammar';
    if v_total = 0 or v_answered <> v_total then
      raise exception 'Grammar phase is incomplete' using errcode = '55000';
    end if;

    select count(*)::integer,
           count(answer.id) filter (where coalesce((answer.answer_data ->> 'serverValidated')::boolean,false))::integer
    into v_total, v_answered
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
    if v_total <> 5 or v_answered <> v_total then
      raise exception 'Translation phase evidence is incomplete' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(event_json), '[]'::jsonb)
    into v_events
    from (
      select jsonb_build_object(
        'clientEventId', 'canonical:grammar:static:' || activity.id::text || ':' || target.item_id::text,
        'itemType', public.canonical_mastery_item_type(target.item_id),
        'itemKey', target.item_id::text,
        'dimension', case when public.canonical_mastery_item_type(target.item_id) = 'grammar' then 'recognition' else 'meaning' end,
        'signal', case when public.canonical_lesson_answer_matches(answer.selected_answer, activity.correct_answer, activity.accepted_answers) then 'correct' else 'incorrect' end,
        'data', jsonb_build_object('source','canonical_phase','phase','grammar','activityId',activity.id)
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
        'data', jsonb_build_object('source','canonical_phase','phase','grammar','translationQuestionId',question.id,'serverValidated',true)
      )
      from public.lesson_translation_questions question
      join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase = 'grammar_translation'
       and answer.activity_id = question.id::text
       and coalesce((answer.answer_data ->> 'serverValidated')::boolean,false)
      where question.user_id = v_session.user_id
        and question.lesson_session_id = v_session.id
        and question.lesson_id = v_session.lesson_id
        and question.lesson_version_id = v_session.lesson_version_id
        and public.canonical_mastery_item_type(question.target_item_id) is not null
    ) evidence;

  elsif p_phase = 'reading' then
    select count(*)::integer,
           count(response.response)::integer,
           count(*) filter (where response.response is not null and btrim(normalize(response.response,NFKC)) = btrim(normalize(question.answer,NFKC)))::integer
    into v_total, v_answered, v_correct
    from public.lesson_reading_questions question
    left join lateral (
      select item ->> 'response' response
      from jsonb_array_elements(case when jsonb_typeof(v_state -> 'readingAnswers')='array' then v_state -> 'readingAnswers' else '[]'::jsonb end) item
      where item ->> 'questionId' = question.id::text
      limit 1
    ) response on true
    where question.lesson_version_id = v_session.lesson_version_id;
    if v_total = 0 or v_answered <> v_total then
      raise exception 'Reading phase is incomplete' using errcode = '55000';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'clientEventId', 'canonical:reading:' || target.item_id::text,
      'itemType', public.canonical_mastery_item_type(target.item_id),
      'itemKey', target.item_id::text,
      'dimension', case when public.canonical_mastery_item_type(target.item_id)='grammar' then 'recognition' else 'meaning' end,
      'signal', case when v_correct = v_total then 'correct' else 'incorrect' end,
      'data', jsonb_build_object('source','canonical_phase','phase','reading','correctAnswers',v_correct,'totalAnswers',v_total)
    )), '[]'::jsonb)
    into v_events
    from (
      select distinct target_id as item_id
      from public.lesson_reading_sections section
      cross join lateral unnest(section.target_item_ids) target(target_id)
      where section.lesson_version_id = v_session.lesson_version_id
    ) target
    where public.canonical_mastery_item_type(target.item_id) is not null;

  elsif p_phase = 'listening' then
    if not v_premium then
      v_source := 'skipped';
      v_events := '[]'::jsonb;
    else
      select count(*)::integer, count(answer.selected_answer)::integer
      into v_total, v_answered
      from public.lesson_listening_activities activity
      left join lateral (
        select event.event_data ->> 'selectedAnswer' selected_answer
        from public.lesson_events event
        where event.user_id = v_session.user_id
          and event.lesson_session_id = v_session.id
          and event.phase='listening' and event.event_type='answer'
          and event.event_data ->> 'questionId' = activity.id::text
        order by event.occurred_at desc, event.created_at desc limit 1
      ) answer on true
      where activity.lesson_version_id = v_session.lesson_version_id;
      if v_total = 0 or v_answered <> v_total then
        raise exception 'Listening phase is incomplete' using errcode = '55000';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'clientEventId', 'canonical:listening:' || activity.id::text || ':' || target.item_id::text,
        'itemType', public.canonical_mastery_item_type(target.item_id),
        'itemKey', target.item_id::text,
        'dimension', case when public.canonical_mastery_item_type(target.item_id)='grammar' then 'recognition' else 'meaning' end,
        'signal', case when btrim(normalize(answer.selected_answer,NFKC)) = btrim(normalize(activity.correct_answer,NFKC)) then 'correct' else 'incorrect' end,
        'data', jsonb_build_object('source','canonical_phase','phase','listening','activityId',activity.id)
      )), '[]'::jsonb)
      into v_events
      from public.lesson_listening_activities activity
      join lateral (
        select event.event_data ->> 'selectedAnswer' selected_answer
        from public.lesson_events event
        where event.user_id = v_session.user_id
          and event.lesson_session_id = v_session.id
          and event.phase='listening' and event.event_type='answer'
          and event.event_data ->> 'questionId' = activity.id::text
        order by event.occurred_at desc, event.created_at desc limit 1
      ) answer on true
      cross join lateral unnest(activity.target_item_ids) target(item_id)
      where activity.lesson_version_id = v_session.lesson_version_id
        and public.canonical_mastery_item_type(target.item_id) is not null;
    end if;

  elsif p_phase = 'speaking' then
    if not v_premium then
      v_source := 'skipped';
      v_events := '[]'::jsonb;
    else
      select count(*)::integer,
             count(answer.id) filter (where coalesce((answer.answer_data ->> 'serverValidated')::boolean,false) and coalesce(answer.answer_data ->> 'score','') ~ '^[0-9]+(\.[0-9]+)?$')::integer
      into v_total, v_answered
      from public.lesson_speaking_activities activity
      left join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase='speaking' and answer.activity_id = activity.id::text
      where activity.lesson_version_id = v_session.lesson_version_id;
      if v_total = 0 or v_answered <> v_total then
        raise exception 'Speaking phase is incomplete' using errcode = '55000';
      end if;

      select coalesce(jsonb_agg(jsonb_build_object(
        'clientEventId', 'canonical:speaking:' || activity.id::text || ':' || target.item_id::text,
        'itemType', public.canonical_mastery_item_type(target.item_id),
        'itemKey', target.item_id::text,
        'dimension', case when public.canonical_mastery_item_type(target.item_id)='grammar' then 'recognition' else 'pronunciation' end,
        'signal', case
          when public.canonical_mastery_item_type(target.item_id)='grammar' then case when (answer.answer_data ->> 'score')::numeric >= 70 then 'correct' else 'incorrect' end
          else case when (answer.answer_data ->> 'score')::numeric >= 70 then 'pronunciation_correct' else 'pronunciation_incorrect' end
        end,
        'data', jsonb_build_object('source','canonical_phase','phase','speaking','activityId',activity.id,'serverValidated',true,'score',(answer.answer_data ->> 'score')::numeric)
      )), '[]'::jsonb)
      into v_events
      from public.lesson_speaking_activities activity
      join public.lesson_activity_answers answer
        on answer.user_id = v_session.user_id
       and answer.lesson_session_id = v_session.id
       and answer.phase='speaking' and answer.activity_id = activity.id::text
       and coalesce((answer.answer_data ->> 'serverValidated')::boolean,false)
       and coalesce(answer.answer_data ->> 'score','') ~ '^[0-9]+(\.[0-9]+)?$'
      cross join lateral unnest(activity.target_item_ids) target(item_id)
      where activity.lesson_version_id = v_session.lesson_version_id
        and public.canonical_mastery_item_type(target.item_id) is not null;
    end if;
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

  insert into public.lesson_phase_mastery_commits (
    lesson_session_id,user_id,phase,mastery_event_count,commit_source
  ) values (p_session_id,v_session.user_id,p_phase,v_event_count,v_source);

  select coalesce(array_agg(commit.phase order by array_position(v_phase_order, commit.phase)), '{}'::text[])
  into v_completed
  from public.lesson_phase_mastery_commits commit
  where commit.lesson_session_id = p_session_id;

  if v_phase_index < 5 then
    v_next_index := v_phase_index + 1;
    v_next_phase := v_phase_order[v_next_index + 1];
  else
    v_next_index := 5;
    v_next_phase := null;
  end if;

  v_state := jsonb_set(v_state, '{completedPhaseIds}', to_jsonb(v_completed), true);
  v_state := jsonb_set(v_state, '{activityIndex}', '0'::jsonb, true);
  v_state := jsonb_set(v_state, '{completed}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionResult}', 'null'::jsonb, true);
  v_state := jsonb_set(v_state, '{completionState}', to_jsonb(case when v_next_phase is null then 'completion_pending' else 'active' end::text), true);
  if v_next_phase is not null then
    v_state := jsonb_set(v_state, '{currentPhaseIndex}', to_jsonb(v_next_index), true);
  end if;

  update public.lesson_sessions
  set current_phase = coalesce(v_next_phase, p_phase),
      current_phase_index = v_next_index,
      activity_index = 0,
      checkpoint = jsonb_set(coalesce(checkpoint,'{}'::jsonb), '{session}', v_state, true),
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
    'completionPending', v_next_phase is null
  );
end;
$$;
revoke all on function public.commit_lesson_phase(uuid,text) from public, anon;
grant execute on function public.commit_lesson_phase(uuid,text) to authenticated;

create or replace function public.reset_incomplete_lesson_phase(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_phase_order constant text[] := array['story','vocabulary','grammar','reading','listening','speaking'];
  v_completed text[] := '{}'::text[];
  v_index integer := 0;
  v_phase text;
  v_state jsonb;
  v_i integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_session from public.lesson_sessions
  where id=p_session_id and user_id=auth.uid() for update;
  if not found then raise exception 'Lesson session unavailable' using errcode='42501'; end if;

  if v_session.status = 'completed' then
    return jsonb_build_object('completed',true,'checkpoint',v_session.checkpoint);
  end if;
  if v_session.status <> 'active' then
    raise exception 'Active lesson session unavailable' using errcode='42501';
  end if;

  select coalesce(array_agg(commit.phase order by array_position(v_phase_order,commit.phase)), '{}'::text[])
  into v_completed
  from public.lesson_phase_mastery_commits commit where commit.lesson_session_id=p_session_id;

  v_phase := null;
  for v_i in 1..array_length(v_phase_order,1) loop
    if not (v_phase_order[v_i] = any(v_completed)) then
      v_index := v_i - 1;
      v_phase := v_phase_order[v_i];
      exit;
    end if;
  end loop;

  v_state := case when jsonb_typeof(v_session.checkpoint->'session')='object' then v_session.checkpoint->'session' else '{}'::jsonb end;
  v_state := jsonb_set(v_state,'{completedPhaseIds}',to_jsonb(v_completed),true);
  v_state := jsonb_set(v_state,'{completed}','false'::jsonb,true);
  v_state := jsonb_set(v_state,'{completionResult}','null'::jsonb,true);

  if v_phase is null then
    v_index := 5;
    v_phase := 'speaking';
    v_state := jsonb_set(v_state,'{activityIndex}','0'::jsonb,true);
    v_state := jsonb_set(v_state,'{currentPhaseIndex}','5'::jsonb,true);
    v_state := jsonb_set(v_state,'{completionState}',to_jsonb('completion_pending'::text),true);
  else
    -- Remove every durable attempt at and after the first uncommitted phase.
    delete from public.lesson_activity_answers answer
    where answer.user_id=v_session.user_id and answer.lesson_session_id=p_session_id
      and (
        (v_index <= 1 and answer.phase='vocabulary') or
        (v_index <= 2 and answer.phase in ('grammar','grammar_translation')) or
        (v_index <= 3 and answer.phase='reading') or
        (v_index <= 4 and answer.phase='listening') or
        (v_index <= 5 and answer.phase='speaking')
      );
    delete from public.lesson_events event
    where event.user_id=v_session.user_id and event.lesson_session_id=p_session_id
      and array_position(v_phase_order,event.phase) is not null
      and array_position(v_phase_order,event.phase) - 1 >= v_index;

    if v_index <= 0 then
      v_state := jsonb_set(v_state,'{storyInteractions}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{storyComplete}','false'::jsonb,true);
    end if;
    if v_index <= 1 then v_state := jsonb_set(v_state,'{vocabularyAnswers}','[]'::jsonb,true); end if;
    if v_index <= 2 then v_state := jsonb_set(v_state,'{grammarAnswers}','[]'::jsonb,true); end if;
    if v_index <= 3 then
      v_state := jsonb_set(v_state,'{readingAnswers}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{readingEvents}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{readingComplete}','false'::jsonb,true);
    end if;
    if v_index <= 4 then
      v_state := jsonb_set(v_state,'{listeningEvents}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{listeningComplete}','false'::jsonb,true);
    end if;
    if v_index <= 5 then
      v_state := jsonb_set(v_state,'{speakingEvents}','[]'::jsonb,true);
      v_state := jsonb_set(v_state,'{speakingComplete}','false'::jsonb,true);
    end if;

    for v_i in v_index+1..6 loop
      v_state := jsonb_set(
        v_state,
        array['activities',v_phase_order[v_i]],
        jsonb_build_object('phaseId',v_phase_order[v_i],'activityIndex',0,'completed',false,'attempts',0),
        true
      );
    end loop;
    v_state := jsonb_set(v_state,'{currentPhaseIndex}',to_jsonb(v_index),true);
    v_state := jsonb_set(v_state,'{activityIndex}','0'::jsonb,true);
    v_state := jsonb_set(v_state,'{completionState}',to_jsonb('active'::text),true);
  end if;

  update public.lesson_sessions
  set current_phase=v_phase,
      current_phase_index=v_index,
      activity_index=0,
      checkpoint=jsonb_set(coalesce(checkpoint,'{}'::jsonb),'{session}',v_state,true),
      last_saved_at=now(),updated_at=now()
  where id=p_session_id;

  return jsonb_build_object(
    'completed',false,
    'currentPhase',v_phase,
    'currentPhaseIndex',v_index,
    'activityIndex',0,
    'completedPhaseIds',to_jsonb(v_completed),
    'checkpoint',jsonb_set(coalesce(v_session.checkpoint,'{}'::jsonb),'{session}',v_state,true),
    'completionPending',cardinality(v_completed)=6
  );
end;
$$;
revoke all on function public.reset_incomplete_lesson_phase(uuid) from public, anon;
grant execute on function public.reset_incomplete_lesson_phase(uuid) to authenticated;

-- Guardrails: no application role can call the reward-bearing internal engine
-- or write mastery rows directly.
do $$
begin
  if has_function_privilege('authenticated','public.apply_canonical_mastery_evidence(uuid,jsonb)','EXECUTE') then
    raise exception 'Canonical mastery engine is exposed to authenticated';
  end if;
  if has_table_privilege('authenticated','public.learner_mastery','INSERT')
     or has_table_privilege('authenticated','public.learner_mastery','UPDATE')
     or has_table_privilege('authenticated','public.learner_mastery','DELETE') then
    raise exception 'Learner mastery remains directly writable';
  end if;
  if not has_function_privilege('authenticated','public.commit_lesson_phase(uuid,text)','EXECUTE') then
    raise exception 'Authenticated learner cannot commit validated phase';
  end if;
end;
$$;
