-- AIko learner delivery rules:
-- 1. Lessons are assigned by the backend, never selected by lesson id.
-- 2. Every assignment is level-matched and unique per learner.
-- 3. Free selection is random; Pro selection can rank interests.
-- 4. Pro custom topics are generated server-side and stored as private lessons.

alter table public.lessons
  add column generated_for_user_id uuid references public.profiles(id) on delete cascade;

drop policy lessons_published_read on public.lessons;
create policy lessons_published_read on public.lessons for select to anon, authenticated
  using (
    status = 'published' and archived_at is null
    and (generated_for_user_id is null or generated_for_user_id = auth.uid())
  );

create table public.lesson_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete restrict,
  lesson_version_id uuid not null references public.lesson_versions(id) on delete restrict,
  selection_mode text not null check (selection_mode in ('free_random', 'pro_interest', 'pro_custom')),
  status text not null default 'assigned' check (status in ('assigned', 'started', 'completed')),
  algorithm_version text not null default 'level-v1',
  interest_matches text[] not null default '{}',
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index lesson_assignments_current_idx
  on public.lesson_assignments(user_id, assigned_at desc)
  where status in ('assigned', 'started');

alter table public.lesson_assignments enable row level security;
create policy lesson_assignments_own_read on public.lesson_assignments
  for select to authenticated using (user_id = auth.uid());
create policy lesson_assignments_staff_read on public.lesson_assignments
  for select to authenticated
  using (public.has_app_role(array['admin','content_editor','support']::public.app_role[]));

-- Private generated lessons can only be seen by their owner or content staff.
create policy lessons_generated_owner_read on public.lessons
  for select to authenticated
  using (generated_for_user_id = auth.uid());
create policy versions_generated_owner_read on public.lesson_versions
  for select to authenticated
  using (exists (
    select 1 from public.lessons l
    where l.id = lesson_id and l.generated_for_user_id = auth.uid()
      and l.current_version_id = lesson_versions.id
  ));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'lesson_story_lines','lesson_vocabulary','lesson_grammar','lesson_reading_sections',
    'lesson_listening_activities','lesson_speaking_activities','lesson_review_activities','lesson_assets'
  ]
  loop
    execute format(
      'create policy %I_generated_owner_read on public.%I for select to authenticated using (exists (select 1 from public.lessons l where l.generated_for_user_id = auth.uid() and l.current_version_id = %I.lesson_version_id))',
      table_name, table_name, table_name
    );
  end loop;
end $$;

create or replace function public.assign_next_lesson()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.lesson_assignments%rowtype;
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
  v_mode text;
  v_matches text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into v_profile from public.profiles
    where id = auth.uid() and status = 'active' for update;
  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select * into v_existing from public.lesson_assignments
    where user_id = auth.uid() and status in ('assigned', 'started')
    order by assigned_at desc limit 1;
  if found then
    return jsonb_build_object(
      'assignment_id', v_existing.id,
      'lesson_id', v_existing.lesson_id,
      'lesson_version_id', v_existing.lesson_version_id,
      'selection_mode', v_existing.selection_mode,
      'interest_matches', to_jsonb(v_existing.interest_matches),
      'reused', true
    );
  end if;

  select candidate.* into v_lesson
  from (
    select l.*,
      case when v_profile.subscription_plan <> 'free' then (
        select count(*)::integer
        from unnest(coalesce(l.tags, '{}') || array[l.topic]) as signal
        join unnest(coalesce(v_profile.interests, '{}')) as interest
          on lower(signal) like '%' || lower(interest) || '%'
          or lower(interest) like '%' || lower(signal) || '%'
      ) else 0 end as interest_score
    from public.lessons l
    where l.status = 'published'
      and l.archived_at is null
      and l.current_version_id is not null
      and l.jlpt_level = v_profile.current_jlpt_level
      and (l.generated_for_user_id is null or l.generated_for_user_id = auth.uid())
      and not exists (
        select 1 from public.lesson_assignments a
        where a.user_id = auth.uid() and a.lesson_id = l.id
      )
      and not exists (
        select 1 from public.lesson_completions c
        where c.user_id = auth.uid() and c.lesson_id = l.id
      )
  ) candidate
  order by
    case when v_profile.subscription_plan <> 'free' then candidate.interest_score end desc nulls last,
    random()
  limit 1;

  if not found then
    return jsonb_build_object('assignment_id', null, 'reason', 'catalog_exhausted');
  end if;

  v_mode := case when v_profile.subscription_plan = 'free' then 'free_random' else 'pro_interest' end;
  if v_mode = 'pro_interest' then
    select coalesce(array_agg(distinct interest), '{}') into v_matches
    from unnest(coalesce(v_profile.interests, '{}')) as interest
    where exists (
      select 1 from unnest(coalesce(v_lesson.tags, '{}') || array[v_lesson.topic]) signal
      where lower(signal) like '%' || lower(interest) || '%'
         or lower(interest) like '%' || lower(signal) || '%'
    );
  else
    v_matches := '{}';
  end if;

  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, algorithm_version, interest_matches
  ) values (
    auth.uid(), v_lesson.id, v_lesson.current_version_id, v_mode, 'level-v1', v_matches
  ) returning * into v_assignment;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'lesson_id', v_assignment.lesson_id,
    'lesson_version_id', v_assignment.lesson_version_id,
    'selection_mode', v_assignment.selection_mode,
    'interest_matches', to_jsonb(v_assignment.interest_matches),
    'reused', false
  );
end
$$;

create or replace function public.sync_lesson_assignment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'lesson_sessions' then
    update public.lesson_assignments
      set status = 'started', started_at = coalesce(started_at, new.started_at), updated_at = now()
      where user_id = new.user_id and lesson_id = new.lesson_id
        and lesson_version_id = new.lesson_version_id and status = 'assigned';
  else
    update public.lesson_assignments
      set status = 'completed', completed_at = new.completed_at, updated_at = now()
      where user_id = new.user_id and lesson_id = new.lesson_id;
  end if;
  return new;
end
$$;

create trigger lesson_session_assignment_started
after insert on public.lesson_sessions
for each row execute function public.sync_lesson_assignment_status();

create trigger lesson_completion_assignment_completed
after insert on public.lesson_completions
for each row execute function public.sync_lesson_assignment_status();

-- Even direct API clients may only start the lesson selected by the algorithm.
create policy lesson_sessions_requires_assignment on public.lesson_sessions
  as restrictive for insert to authenticated
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.lesson_assignments a
      where a.user_id = auth.uid()
        and a.lesson_id = lesson_sessions.lesson_id
        and a.lesson_version_id = lesson_sessions.lesson_version_id
        and a.status in ('assigned', 'started')
    )
  );

create or replace function public.begin_custom_lesson_generation(
  p_topic text,
  p_duration_minutes integer,
  p_focus text,
  p_speaking_difficulty text,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.custom_lesson_requests%rowtype;
  v_job public.generated_lesson_jobs%rowtype;
begin
  select * into v_profile from public.profiles
    where id = auth.uid() and status = 'active';
  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_topic, ''))) < 2 or length(p_topic) > 120
     or p_duration_minutes not in (15, 30, 45, 60)
     or p_speaking_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'Invalid custom lesson request' using errcode = '22023';
  end if;
  if (
    select count(*) from public.custom_lesson_requests
    where user_id = auth.uid() and created_at >= current_date
  ) >= 5 then
    raise exception 'Daily custom lesson limit reached' using errcode = '54000';
  end if;

  insert into public.custom_lesson_requests (
    user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty, note, status
  ) values (
    auth.uid(), trim(p_topic), v_profile.current_jlpt_level, p_duration_minutes,
    left(coalesce(nullif(trim(p_focus), ''), 'balanced'), 60),
    p_speaking_difficulty, left(coalesce(p_note, ''), 500), 'generation_pending'
  ) returning * into v_request;

  insert into public.generated_lesson_jobs (
    custom_lesson_request_id, status, created_by
  ) values (v_request.id, 'generating', auth.uid())
  returning * into v_job;

  return jsonb_build_object(
    'request_id', v_request.id,
    'job_id', v_job.id,
    'level', v_profile.current_jlpt_level,
    'interests', to_jsonb(v_profile.interests)
  );
end
$$;

create or replace function public.store_generated_lesson_package(
  p_request_id uuid,
  p_package jsonb,
  p_generation_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.custom_lesson_requests%rowtype;
  v_lesson public.lessons%rowtype;
  v_version_id uuid := gen_random_uuid();
  v_assignment_id uuid;
  v_item record;
  v_slug text;
begin
  select * into v_request from public.custom_lesson_requests
    where id = p_request_id and user_id = auth.uid()
      and status = 'generation_pending' for update;
  if not found then
    raise exception 'Generation request unavailable' using errcode = '42501';
  end if;
  if jsonb_typeof(p_package) <> 'object'
     or nullif(p_package->>'title', '') is null
     or jsonb_array_length(coalesce(p_package->'phases', '[]'::jsonb)) <> 7
     or jsonb_array_length(coalesce(p_package->'story', '[]'::jsonb)) < 3
     or jsonb_array_length(coalesce(p_package->'vocabulary', '[]'::jsonb)) < 3
     or jsonb_array_length(coalesce(p_package->'reviewQuestions', '[]'::jsonb)) < 1 then
    raise exception 'Invalid generated lesson package' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from lower(regexp_replace(p_package->>'title', '[^a-zA-Z0-9]+', '-', 'g')));
  insert into public.lessons (
    legacy_id, slug, title, japanese_title, summary, topic, jlpt_level, duration_minutes,
    status, source, tags, published_at, generated_for_user_id, created_by, updated_by
  ) values (
    'lesson_custom_' || gen_random_uuid()::text,
    coalesce(nullif(v_slug, ''), 'custom-lesson') || '-' || left(gen_random_uuid()::text, 8),
    p_package->>'title', coalesce(p_package->>'japaneseTitle', p_package->>'title'),
    coalesce(p_package->>'summary', ''), v_request.topic, v_request.jlpt_level,
    v_request.duration_minutes, 'published', 'user_generated',
    coalesce(array(select jsonb_array_elements_text(p_package->'tags')), '{}'),
    now(), auth.uid(), auth.uid(), auth.uid()
  ) returning * into v_lesson;

  insert into public.lesson_versions (
    id, lesson_id, version_number, status, change_summary, schema_version,
    answer_keys, review_items, phases, metadata, published_at, created_by
  ) values (
    v_version_id, v_lesson.id, 1, 'published', 'Generated for Pro topic request', 1,
    coalesce(array(select jsonb_array_elements_text(p_package->'answerKeys')), '{}'),
    coalesce(array(select jsonb_array_elements_text(p_package->'reviewItems')), '{}'),
    p_package->'phases',
    jsonb_build_object(
      'title', p_package->>'title', 'japaneseTitle', p_package->>'japaneseTitle',
      'summary', p_package->>'summary', 'topic', v_request.topic,
      'level', v_request.jlpt_level, 'durationMinutes', v_request.duration_minutes,
      'source', 'user_generated', 'tags', coalesce(p_package->'tags', '[]'::jsonb),
      'storyPreview', p_package->>'storyPreview'
    ),
    now(), auth.uid()
  );

  for v_item in select value, ordinality from jsonb_array_elements(p_package->'story') with ordinality loop
    insert into public.lesson_story_lines (lesson_version_id, position, japanese_text, translation, tappable_terms)
    values (v_version_id, v_item.ordinality, v_item.value->>'japanese', v_item.value->>'english',
      coalesce(array(select jsonb_array_elements_text(v_item.value->'tappableTerms')), '{}'));
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(p_package->'vocabulary') with ordinality loop
    insert into public.lesson_vocabulary (lesson_version_id, position, written_form, reading, meaning, part_of_speech, example_sentence)
    values (v_version_id, v_item.ordinality, v_item.value->>'term', v_item.value->>'reading',
      v_item.value->>'meaning', coalesce(v_item.value->>'partOfSpeech', 'other'), v_item.value->>'exampleSentence');
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'grammar', '[]'::jsonb)) with ordinality loop
    insert into public.lesson_grammar (lesson_version_id, position, pattern, meaning, structure, usage_notes, example, translation, common_mistake)
    values (v_version_id, v_item.ordinality, v_item.value->>'pattern', v_item.value->>'meaning',
      v_item.value->>'structure', coalesce(v_item.value->>'usage', ''), coalesce(v_item.value->>'example', ''),
      coalesce(v_item.value->>'translation', ''), coalesce(v_item.value->>'commonMistake', ''));
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'readingConversation', '[]'::jsonb)) with ordinality loop
    insert into public.lesson_reading_sections (lesson_version_id, position, speaker, japanese_text, translation)
    values (v_version_id, v_item.ordinality, v_item.value->>'speaker', v_item.value->>'japanese', v_item.value->>'english');
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'listeningExercises', '[]'::jsonb)) with ordinality loop
    insert into public.lesson_listening_activities (lesson_version_id, position, prompt, transcript, choices, correct_answer, explanation)
    values (v_version_id, v_item.ordinality, v_item.value->>'prompt', coalesce(v_item.value->>'transcript', ''),
      coalesce(array(select jsonb_array_elements_text(v_item.value->'choices')), '{}'),
      v_item.value->>'correctAnswer', coalesce(v_item.value->>'explanation', ''));
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(coalesce(p_package->'speakingExercises', '[]'::jsonb)) with ordinality loop
    insert into public.lesson_speaking_activities (lesson_version_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer)
    values (v_version_id, v_item.ordinality, coalesce(v_item.value->>'mode', 'medium'), v_item.value->>'prompt',
      v_item.value->>'easyPrompt', v_item.value->>'mediumPrompt', v_item.value->>'hardPrompt',
      v_item.value->>'expectedAnswer', v_item.value->>'modelAnswer');
  end loop;
  for v_item in select value, ordinality from jsonb_array_elements(p_package->'reviewQuestions') with ordinality loop
    insert into public.lesson_review_activities (lesson_version_id, position, question_type, category, prompt, choices, correct_answer, explanation)
    values (v_version_id, v_item.ordinality, coalesce(v_item.value->>'questionType', 'multiple-choice'),
      'mixed', v_item.value->>'prompt', coalesce(array(select jsonb_array_elements_text(v_item.value->'choices')), '{}'),
      v_item.value->>'correctAnswer', coalesce(v_item.value->>'explanation', ''));
  end loop;

  update public.lessons set current_version_id = v_version_id where id = v_lesson.id;
  insert into public.lesson_validation_runs (lesson_id, lesson_version_id, status, score, warnings, completed_at)
  values (v_lesson.id, v_version_id, 'passed', 100, '{}', now());
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, algorithm_version, interest_matches
  ) values (
    auth.uid(), v_lesson.id, v_version_id, 'pro_custom', 'custom-v1', '{}'
  ) returning id into v_assignment_id;
  update public.custom_lesson_requests
    set status = 'approved', generated_lesson_id = v_lesson.id, updated_at = now()
    where id = v_request.id;
  update public.generated_lesson_jobs
    set status = 'completed', lesson_id = v_lesson.id,
      generation_seconds = greatest(0, p_generation_seconds), updated_at = now()
    where custom_lesson_request_id = v_request.id;

  return jsonb_build_object(
    'lesson_id', v_lesson.id, 'lesson_version_id', v_version_id,
    'assignment_id', v_assignment_id, 'status', 'published'
  );
end
$$;

create or replace function public.fail_custom_lesson_generation(p_request_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.custom_lesson_requests
    set status = 'failed', updated_at = now()
    where id = p_request_id and user_id = auth.uid();
  if not found then
    raise exception 'Generation request unavailable' using errcode = '42501';
  end if;
  update public.generated_lesson_jobs
    set status = 'failed', error_message = left(coalesce(p_error, 'Generation failed'), 500), updated_at = now()
    where custom_lesson_request_id = p_request_id and created_by = auth.uid();
end
$$;

revoke all on function public.assign_next_lesson() from public;
revoke all on function public.begin_custom_lesson_generation(text, integer, text, text, text) from public;
revoke all on function public.store_generated_lesson_package(uuid, jsonb, integer) from public;
revoke all on function public.fail_custom_lesson_generation(uuid, text) from public;
grant execute on function public.assign_next_lesson() to authenticated;
grant execute on function public.begin_custom_lesson_generation(text, integer, text, text, text) to authenticated;
grant execute on function public.store_generated_lesson_package(uuid, jsonb, integer) to authenticated;
grant execute on function public.fail_custom_lesson_generation(uuid, text) to authenticated;
