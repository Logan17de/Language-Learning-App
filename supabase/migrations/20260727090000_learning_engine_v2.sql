-- AIko learning engine V2
--
-- The UI asks only for a topic and JLPT level. The engine owns target
-- selection, an encouraging tone, reusable language records, lesson reuse,
-- and per-learner mastery. Generated lessons are shared content; assignments,
-- sessions, evidence, scores, and review queues remain private to a learner.

-- ---------------------------------------------------------------------------
-- Reusable language-library provenance
-- ---------------------------------------------------------------------------

alter table public.kanji_records
  add column if not exists source_type text not null default 'legacy'
    check (source_type in ('legacy', 'curated', 'imported', 'ai_enriched')),
  add column if not exists source_model text,
  add column if not exists quality_status text not null default 'usable'
    check (quality_status in ('usable', 'needs_review', 'verified', 'rejected')),
  add column if not exists source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload) = 'object'),
  add column if not exists usage_count integer not null default 0
    check (usage_count >= 0),
  add column if not exists last_used_at timestamptz;

alter table public.grammar_records
  add column if not exists source_type text not null default 'legacy'
    check (source_type in ('legacy', 'curated', 'imported', 'ai_enriched')),
  add column if not exists source_model text,
  add column if not exists quality_status text not null default 'usable'
    check (quality_status in ('usable', 'needs_review', 'verified', 'rejected')),
  add column if not exists source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload) = 'object'),
  add column if not exists usage_count integer not null default 0
    check (usage_count >= 0),
  add column if not exists last_used_at timestamptz;

alter table public.vocabulary_records
  add column if not exists source_type text not null default 'legacy'
    check (source_type in ('legacy', 'curated', 'imported', 'ai_enriched')),
  add column if not exists source_model text,
  add column if not exists quality_status text not null default 'usable'
    check (quality_status in ('usable', 'needs_review', 'verified', 'rejected')),
  add column if not exists source_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_payload) = 'object'),
  add column if not exists usage_count integer not null default 0
    check (usage_count >= 0),
  add column if not exists last_used_at timestamptz;

create index if not exists kanji_records_generation_lookup_idx
  on public.kanji_records (character)
  where archived_at is null and quality_status <> 'rejected';

create index if not exists grammar_records_generation_lookup_idx
  on public.grammar_records (jlpt_level, pattern)
  where archived_at is null and quality_status <> 'rejected';

create index if not exists vocabulary_records_generation_lookup_idx
  on public.vocabulary_records (written_form, reading)
  where archived_at is null and quality_status <> 'rejected';

-- Empty mastery records mean "not learned", not "perfectly learned".
alter table public.learner_mastery
  alter column meaning_score set default 0,
  alter column recognition_score set default 0,
  alter column pronunciation_score set default 0;

update public.learner_mastery
set meaning_score = 0,
    recognition_score = 0,
    pronunciation_score = 0,
    mastery = 0,
    confidence = 0,
    updated_at = now()
where evidence_count = 0;

-- ---------------------------------------------------------------------------
-- Shared reusable lessons
-- ---------------------------------------------------------------------------

create or replace function public.normalize_lesson_topic(p_topic text)
returns text
language sql
immutable
set search_path = public
as $$
  select lower(regexp_replace(trim(coalesce(p_topic, '')), '\s+', ' ', 'g'))
$$;

alter table public.lessons
  add column if not exists normalized_topic text not null default '',
  add column if not exists content_signature text,
  add column if not exists reusable boolean not null default false,
  add column if not exists usage_count integer not null default 0
    check (usage_count >= 0),
  add column if not exists last_assigned_at timestamptz;

update public.lessons
set normalized_topic = public.normalize_lesson_topic(topic),
    reusable = case
      when generated_for_user_id is null then true
      else reusable
    end
where normalized_topic = '' or (generated_for_user_id is null and not reusable);

create or replace function public.set_normalized_lesson_topic()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.normalized_topic := public.normalize_lesson_topic(new.topic);
  return new;
end
$$;

drop trigger if exists lessons_normalize_topic on public.lessons;
create trigger lessons_normalize_topic
before insert or update of topic on public.lessons
for each row execute function public.set_normalized_lesson_topic();

create unique index if not exists lessons_reusable_signature_unique_idx
  on public.lessons (jlpt_level, content_signature)
  where reusable and content_signature is not null and archived_at is null;

create index if not exists lessons_reusable_topic_idx
  on public.lessons (jlpt_level, normalized_topic, published_at desc)
  where reusable and status = 'published' and archived_at is null;

-- Vocabulary and grammar practice are first-class lesson content. This keeps
-- the player off mock data and lets stored lessons be replayed by any learner.
create table if not exists public.lesson_practice_activities (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  phase text not null check (phase in ('vocabulary', 'grammar')),
  activity_type text not null check (
    activity_type in ('multiple_choice', 'word_order', 'matching', 'text_input')
  ),
  difficulty text not null check (difficulty in ('Easy', 'Medium', 'Hard')),
  mode text not null,
  skill text not null check (skill in ('understanding', 'production')),
  prompt text not null,
  cue text not null default '',
  choices text[] not null default '{}',
  correct_answer text not null,
  accepted_answers text[] not null default '{}',
  explanation text not null default '',
  hint_front text not null default '',
  hint_back text not null default '',
  target_item_ids uuid[] not null default '{}',
  inspectable_terms jsonb not null default '[]'::jsonb
    check (jsonb_typeof(inspectable_terms) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, phase, position)
);

alter table public.lesson_practice_activities enable row level security;

create policy lesson_practice_activities_public_read
  on public.lesson_practice_activities for select to anon, authenticated
  using (exists (
    select 1
    from public.lessons l
    where l.status = 'published'
      and l.current_version_id = lesson_practice_activities.lesson_version_id
  ));

create policy lesson_practice_activities_active_session_read
  on public.lesson_practice_activities for select to authenticated
  using (exists (
    select 1
    from public.lesson_sessions s
    where s.lesson_version_id = lesson_practice_activities.lesson_version_id
      and s.user_id = auth.uid()
      and s.status = 'active'
  ));

create policy lesson_practice_activities_staff_all
  on public.lesson_practice_activities for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

grant select on public.lesson_practice_activities to anon, authenticated;
grant insert, update, delete on public.lesson_practice_activities to authenticated;

drop trigger if exists lesson_practice_activities_updated_at
  on public.lesson_practice_activities;
create trigger lesson_practice_activities_updated_at
before update on public.lesson_practice_activities
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Immutable learner evidence and deterministic scores
-- ---------------------------------------------------------------------------

create table if not exists public.learner_mastery_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  lesson_version_id uuid references public.lesson_versions(id) on delete set null,
  lesson_session_id uuid references public.lesson_sessions(id) on delete set null,
  client_event_id text not null,
  item_type text not null check (item_type in ('kanji', 'vocabulary', 'grammar')),
  item_key text not null,
  dimension text not null check (dimension in ('meaning', 'recognition', 'pronunciation')),
  signal text not null check (
    signal in (
      'exposure',
      'revealed_reading',
      'revealed_meaning',
      'correct',
      'incorrect',
      'pronunciation_correct',
      'pronunciation_incorrect'
    )
  ),
  score_delta integer not null check (score_delta between -20 and 20),
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, client_event_id)
);

create index if not exists learner_mastery_events_item_idx
  on public.learner_mastery_events (user_id, item_type, item_key, occurred_at desc);

alter table public.learner_mastery_events enable row level security;

create policy learner_mastery_events_own_select
  on public.learner_mastery_events for select to authenticated
  using (user_id = auth.uid());

grant select on public.learner_mastery_events to authenticated;

create or replace function public.mastery_prompt_data(
  p_item_type text,
  p_item_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_prompt jsonb;
begin
  if p_item_type = 'kanji' then
    select jsonb_build_object(
      'character', character,
      'meanings', to_jsonb(meanings),
      'readings', to_jsonb(readings)
    )
    into v_prompt
    from public.kanji_records
    where id::text = p_item_key
      and archived_at is null
      and quality_status <> 'rejected';
  elsif p_item_type = 'vocabulary' then
    select jsonb_build_object(
      'term', written_form,
      'reading', reading,
      'meaning', meaning,
      'partOfSpeech', part_of_speech
    )
    into v_prompt
    from public.vocabulary_records
    where id::text = p_item_key
      and archived_at is null
      and quality_status <> 'rejected';
  elsif p_item_type = 'grammar' then
    select jsonb_build_object(
      'pattern', pattern,
      'meaning', meaning,
      'formation', formation,
      'examples', to_jsonb(example_sentences)
    )
    into v_prompt
    from public.grammar_records
    where id::text = p_item_key
      and archived_at is null
      and quality_status <> 'rejected';
  end if;

  return coalesce(v_prompt, '{}'::jsonb);
end
$$;

create or replace function public.record_mastery_evidence(
  p_session_id uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_event jsonb;
  v_client_event_id text;
  v_item_type text;
  v_item_key text;
  v_dimension text;
  v_signal text;
  v_delta integer;
  v_inserted integer;
  v_processed integer := 0;
  v_mastery public.learner_mastery%rowtype;
  v_calculated_mastery integer;
  v_due_at timestamptz;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_session
  from public.lesson_sessions
  where id = p_session_id
    and user_id = auth.uid()
    and status in ('active', 'completed');

  if not found then
    raise exception 'Lesson session unavailable' using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) < 1
     or jsonb_array_length(p_events) > 100 then
    raise exception 'Mastery events must be an array of 1-100 items'
      using errcode = '22023';
  end if;

  for v_event in select value from jsonb_array_elements(p_events)
  loop
    v_client_event_id := trim(coalesce(v_event->>'clientEventId', ''));
    v_item_type := v_event->>'itemType';
    v_item_key := trim(coalesce(v_event->>'itemKey', ''));
    v_dimension := v_event->>'dimension';
    v_signal := v_event->>'signal';

    if v_client_event_id = ''
       or length(v_client_event_id) > 160
       or v_item_type not in ('kanji', 'vocabulary', 'grammar')
       or v_item_key = ''
       or v_dimension not in ('meaning', 'recognition', 'pronunciation')
       or v_signal not in (
         'exposure',
         'revealed_reading',
         'revealed_meaning',
         'correct',
         'incorrect',
         'pronunciation_correct',
         'pronunciation_incorrect'
       ) then
      raise exception 'Invalid mastery event' using errcode = '22023';
    end if;

    if v_item_type = 'kanji' and not exists (
      select 1 from public.kanji_records
      where id::text = v_item_key and archived_at is null and quality_status <> 'rejected'
    ) then
      raise exception 'Unknown kanji mastery key' using errcode = '22023';
    elsif v_item_type = 'vocabulary' and not exists (
      select 1 from public.vocabulary_records
      where id::text = v_item_key and archived_at is null and quality_status <> 'rejected'
    ) then
      raise exception 'Unknown vocabulary mastery key' using errcode = '22023';
    elsif v_item_type = 'grammar' and not exists (
      select 1 from public.grammar_records
      where id::text = v_item_key and archived_at is null and quality_status <> 'rejected'
    ) then
      raise exception 'Unknown grammar mastery key' using errcode = '22023';
    end if;

    if not (
      (
        v_item_type = 'kanji'
        and exists (
          select 1
          from public.lesson_versions version
          where version.id = v_session.lesson_version_id
            and (
              coalesce(version.metadata->'targetKanjiIds', '[]'::jsonb)
                ? v_item_key
              or exists (
                select 1
                from public.lesson_story_words word
                where word.lesson_version_id = v_session.lesson_version_id
                  and word.library_type = 'kanji'
                  and word.library_id::text = v_item_key
              )
            )
        )
      )
      or (
        v_item_type = 'vocabulary'
        and (
          exists (
            select 1
            from public.lesson_vocabulary vocabulary
            where vocabulary.lesson_version_id = v_session.lesson_version_id
              and vocabulary.vocabulary_id::text = v_item_key
          )
          or exists (
            select 1
            from public.lesson_story_words word
            where word.lesson_version_id = v_session.lesson_version_id
              and word.library_type = 'vocabulary'
              and word.library_id::text = v_item_key
          )
        )
      )
      or (
        v_item_type = 'grammar'
        and exists (
          select 1
          from public.lesson_grammar grammar
          where grammar.lesson_version_id = v_session.lesson_version_id
            and grammar.grammar_id::text = v_item_key
        )
      )
    ) then
      raise exception 'Mastery item is not part of this lesson'
        using errcode = '22023';
    end if;

    v_delta := case v_signal
      when 'exposure' then 1
      when 'revealed_reading' then -2
      when 'revealed_meaning' then -3
      when 'correct' then 8
      when 'incorrect' then -6
      when 'pronunciation_correct' then 8
      when 'pronunciation_incorrect' then -6
      else 0
    end;

    insert into public.learner_mastery_events (
      user_id,
      lesson_id,
      lesson_version_id,
      lesson_session_id,
      client_event_id,
      item_type,
      item_key,
      dimension,
      signal,
      score_delta,
      event_data,
      occurred_at
    ) values (
      auth.uid(),
      v_session.lesson_id,
      v_session.lesson_version_id,
      v_session.id,
      v_client_event_id,
      v_item_type,
      v_item_key,
      v_dimension,
      v_signal,
      v_delta,
      case
        when jsonb_typeof(v_event->'data') = 'object' then v_event->'data'
        else '{}'::jsonb
      end,
      now()
    )
    on conflict (user_id, client_event_id) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      continue;
    end if;

    insert into public.learner_mastery (
      user_id,
      item_type,
      item_key,
      mastery,
      confidence,
      evidence_count,
      meaning_score,
      recognition_score,
      pronunciation_score,
      last_reviewed_at,
      next_review_at
    ) values (
      auth.uid(),
      v_item_type,
      v_item_key,
      0,
      0,
      0,
      0,
      0,
      0,
      now(),
      now()
    )
    on conflict (user_id, item_type, item_key) do nothing;

    update public.learner_mastery
    set meaning_score = case
          when v_dimension = 'meaning'
            then greatest(0, least(100, meaning_score + v_delta))
          else meaning_score
        end,
        recognition_score = case
          when v_dimension = 'recognition'
            then greatest(0, least(100, recognition_score + v_delta))
          else recognition_score
        end,
        pronunciation_score = case
          when v_dimension = 'pronunciation'
            then greatest(0, least(100, pronunciation_score + v_delta))
          else pronunciation_score
        end,
        evidence_count = evidence_count + 1,
        last_reviewed_at = now(),
        updated_at = now()
    where user_id = auth.uid()
      and item_type = v_item_type
      and item_key = v_item_key
    returning * into v_mastery;

    v_calculated_mastery := case
      when v_item_type = 'grammar' then v_mastery.meaning_score
      when exists (
        select 1
        from public.learner_mastery_events event
        where event.user_id = auth.uid()
          and event.item_type = v_item_type
          and event.item_key = v_item_key
          and event.dimension = 'pronunciation'
      ) then round(
        (
          v_mastery.meaning_score
          + v_mastery.recognition_score
          + v_mastery.pronunciation_score
        )::numeric / 3
      )::integer
      else round(
        (v_mastery.meaning_score + v_mastery.recognition_score)::numeric / 2
      )::integer
    end;

    update public.learner_mastery
    set mastery = v_calculated_mastery,
        confidence = least(100, v_mastery.evidence_count * 5),
        next_review_at = case
          when v_calculated_mastery < 60 then now()
          when v_calculated_mastery < 80 then now() + interval '1 day'
          else now() + interval '7 days'
        end,
        updated_at = now()
    where id = v_mastery.id
    returning * into v_mastery;

    v_status := case
      when v_mastery.mastery >= 85 and v_mastery.confidence >= 70 then 'mastered'
      when v_mastery.next_review_at <= now() then 'due'
      else 'scheduled'
    end;
    v_due_at := coalesce(v_mastery.next_review_at, now());

    insert into public.review_queue (
      user_id,
      item_type,
      item_key,
      prompt_data,
      due_at,
      confidence,
      reason,
      status
    ) values (
      auth.uid(),
      v_item_type,
      v_item_key,
      public.mastery_prompt_data(v_item_type, v_item_key),
      v_due_at,
      v_mastery.confidence,
      case
        when v_signal in ('incorrect', 'pronunciation_incorrect')
          then 'Incorrect answer'
        when v_signal in ('revealed_reading', 'revealed_meaning')
          then 'Used help'
        else 'Scheduled practice'
      end,
      v_status
    )
    on conflict (user_id, item_type, item_key) do update
    set prompt_data = excluded.prompt_data,
        due_at = excluded.due_at,
        confidence = excluded.confidence,
        reason = excluded.reason,
        status = excluded.status,
        updated_at = now();

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'processed', v_processed,
    'deduplicated', jsonb_array_length(p_events) - v_processed
  );
end
$$;

create or replace function public.apply_review_answer_mastery()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_queue public.review_queue%rowtype;
  v_dimension text;
  v_delta integer;
  v_inserted integer;
  v_mastery public.learner_mastery%rowtype;
  v_calculated_mastery integer;
begin
  if new.review_queue_id is null then
    return new;
  end if;

  select *
  into v_queue
  from public.review_queue
  where id = new.review_queue_id
    and user_id = new.user_id;

  if not found
     or v_queue.item_type not in ('kanji', 'vocabulary', 'grammar') then
    return new;
  end if;

  v_dimension := case
    when v_queue.item_type = 'kanji' then 'recognition'
    else 'meaning'
  end;
  v_delta := case when new.correct then 8 else -6 end;

  insert into public.learner_mastery_events (
    user_id,
    client_event_id,
    item_type,
    item_key,
    dimension,
    signal,
    score_delta,
    event_data
  ) values (
    new.user_id,
    'review:' || new.review_session_id::text || ':' || new.activity_id,
    v_queue.item_type,
    v_queue.item_key,
    v_dimension,
    case when new.correct then 'correct' else 'incorrect' end,
    v_delta,
    jsonb_build_object(
      'reviewQueueId', new.review_queue_id,
      'selectedAnswer', new.selected_answer
    )
  )
  on conflict (user_id, client_event_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return new;
  end if;

  update public.learner_mastery
  set meaning_score = case
        when v_dimension = 'meaning'
          then greatest(0, least(100, meaning_score + v_delta))
        else meaning_score
      end,
      recognition_score = case
        when v_dimension = 'recognition'
          then greatest(0, least(100, recognition_score + v_delta))
        else recognition_score
      end,
      evidence_count = evidence_count + 1,
      last_reviewed_at = now(),
      updated_at = now()
  where user_id = new.user_id
    and item_type = v_queue.item_type
    and item_key = v_queue.item_key
  returning * into v_mastery;

  if found then
    v_calculated_mastery := case
      when v_queue.item_type = 'grammar' then v_mastery.meaning_score
      else round(
        (v_mastery.meaning_score + v_mastery.recognition_score)::numeric / 2
      )::integer
    end;
    update public.learner_mastery
    set mastery = v_calculated_mastery,
        confidence = least(100, v_mastery.evidence_count * 5),
        next_review_at = case
          when v_calculated_mastery < 60 then now()
          when v_calculated_mastery < 80 then now() + interval '1 day'
          else now() + interval '7 days'
        end,
        updated_at = now()
    where id = v_mastery.id;
  end if;

  return new;
end
$$;

drop trigger if exists review_answer_mastery
  on public.review_activity_answers;
create trigger review_answer_mastery
after insert or update on public.review_activity_answers
for each row execute function public.apply_review_answer_mastery();

-- ---------------------------------------------------------------------------
-- Reuse before generation
-- ---------------------------------------------------------------------------

create or replace function public.begin_custom_lesson_generation_v3(
  p_topic text,
  p_level public.jlpt_level
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
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
  v_normalized_topic text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_topic, ''))) < 2 or length(p_topic) > 120 then
    raise exception 'Invalid custom lesson request' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and created_at >= current_date
      and status <> 'failed'
  ) >= 5 then
    raise exception 'Daily custom lesson limit reached' using errcode = '54000';
  end if;

  v_normalized_topic := public.normalize_lesson_topic(p_topic);

  select candidate.*
  into v_lesson
  from public.lessons candidate
  where candidate.status = 'published'
    and candidate.archived_at is null
    and candidate.current_version_id is not null
    and candidate.reusable
    and candidate.generated_for_user_id is null
    and candidate.jlpt_level = p_level
    and not exists (
      select 1
      from public.lesson_assignments a
      where a.user_id = auth.uid() and a.lesson_id = candidate.id
    )
    and not exists (
      select 1
      from public.lesson_completions c
      where c.user_id = auth.uid() and c.lesson_id = candidate.id
    )
    and (
      candidate.normalized_topic = v_normalized_topic
      or (
        least(
          char_length(candidate.normalized_topic),
          char_length(v_normalized_topic)
        ) >= 4
        and (
          position(candidate.normalized_topic in v_normalized_topic) > 0
          or position(v_normalized_topic in candidate.normalized_topic) > 0
        )
      )
      or exists (
        select 1
        from regexp_split_to_table(candidate.normalized_topic, '[^[:alnum:]]+') candidate_token
        join regexp_split_to_table(v_normalized_topic, '[^[:alnum:]]+') request_token
          on candidate_token = request_token
        where char_length(candidate_token) >= 3
      )
      or exists (
        select 1
        from unnest(candidate.tags) tag
        where v_normalized_topic like '%' || lower(tag) || '%'
           or lower(tag) like '%' || v_normalized_topic || '%'
      )
    )
  order by
    case
      when candidate.normalized_topic = v_normalized_topic then 0
      when (
        least(
          char_length(candidate.normalized_topic),
          char_length(v_normalized_topic)
        ) >= 4
        and (
          position(candidate.normalized_topic in v_normalized_topic) > 0
          or position(v_normalized_topic in candidate.normalized_topic) > 0
        )
      ) then 1
      else 2
    end,
    candidate.usage_count asc,
    candidate.published_at desc nulls last
  limit 1;

  insert into public.custom_lesson_requests (
    user_id,
    topic,
    jlpt_level,
    duration_minutes,
    focus,
    speaking_difficulty,
    note,
    status,
    generated_lesson_id
  ) values (
    auth.uid(),
    trim(p_topic),
    p_level,
    30,
    'balanced',
    'medium',
    '',
    case when v_lesson.id is null then 'generation_pending' else 'approved' end,
    v_lesson.id
  )
  returning * into v_request;

  if v_lesson.id is not null then
    insert into public.lesson_assignments (
      user_id,
      lesson_id,
      lesson_version_id,
      selection_mode,
      algorithm_version,
      interest_matches
    ) values (
      auth.uid(),
      v_lesson.id,
      v_lesson.current_version_id,
      'pro_custom',
      'custom-reuse-v2',
      '{}'
    )
    returning * into v_assignment;

    update public.lessons
    set usage_count = usage_count + 1,
        last_assigned_at = now(),
        updated_at = now()
    where id = v_lesson.id;

    return jsonb_build_object(
      'request_id', v_request.id,
      'job_id', null,
      'level', p_level,
      'interests', to_jsonb(v_profile.interests),
      'reused', true,
      'lesson_id', v_lesson.id,
      'lesson_version_id', v_lesson.current_version_id,
      'assignment_id', v_assignment.id
    );
  end if;

  insert into public.generated_lesson_jobs (
    custom_lesson_request_id,
    status,
    created_by
  ) values (
    v_request.id,
    'generating',
    auth.uid()
  )
  returning * into v_job;

  return jsonb_build_object(
    'request_id', v_request.id,
    'job_id', v_job.id,
    'level', p_level,
    'interests', to_jsonb(v_profile.interests),
    'reused', false,
    'lesson_id', null
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Strict, permanent enrichment of only missing library entries
-- ---------------------------------------------------------------------------

create or replace function public.enrich_custom_lesson_library_v2(
  p_level public.jlpt_level,
  p_seed jsonb,
  p_source_model text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_item jsonb;
  v_linked_kanji uuid[];
  v_inserted_kanji integer := 0;
  v_inserted_grammar integer := 0;
  v_inserted_vocabulary integer := 0;
  v_rows integer;
  v_item_level public.jlpt_level;
begin
  select *
  into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_seed) <> 'object'
     or jsonb_typeof(p_seed->'kanji') <> 'array'
     or jsonb_typeof(p_seed->'grammar') <> 'array'
     or jsonb_typeof(p_seed->'vocabulary') <> 'array'
     or jsonb_array_length(p_seed->'kanji') > 20
     or jsonb_array_length(p_seed->'grammar') > 10
     or jsonb_array_length(p_seed->'vocabulary') > 80 then
    raise exception 'Invalid lesson library enrichment payload'
      using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_seed->'kanji')
  loop
    select catalog.jlpt_level
    into v_item_level
    from public.kanji_catalog catalog
    where catalog.character = trim(v_item->>'character')
      and catalog.active
      and (
        case catalog.jlpt_level
          when 'N5' then 1
          when 'N4' then 2
          when 'N3' then 3
          when 'N2' then 4
          when 'N1' then 5
        end
      ) <= (
        case p_level
          when 'N5' then 1
          when 'N4' then 2
          when 'N3' then 3
          when 'N2' then 4
          when 'N1' then 5
        end
      )
    limit 1;

    if length(trim(coalesce(v_item->>'character', ''))) < 1
       or jsonb_typeof(v_item->'meanings') <> 'array'
       or jsonb_array_length(v_item->'meanings') < 1
       or jsonb_typeof(v_item->'readings') <> 'array'
       or jsonb_array_length(v_item->'readings') < 1
       or v_item_level is null then
      raise exception 'Invalid or out-of-catalog kanji enrichment'
        using errcode = '22023';
    end if;

    insert into public.kanji_records (
      character,
      jlpt_level,
      meanings,
      readings,
      onyomi,
      kunyomi,
      example_words,
      stroke_count,
      source_type,
      source_model,
      quality_status,
      source_payload
    ) values (
      trim(v_item->>'character'),
      v_item_level,
      array(select jsonb_array_elements_text(v_item->'meanings')),
      array(select jsonb_array_elements_text(v_item->'readings')),
      coalesce(array(select jsonb_array_elements_text(v_item->'onyomi')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'kunyomi')), '{}'),
      coalesce(array(select jsonb_array_elements_text(v_item->'exampleWords')), '{}'),
      greatest(1, least(64, coalesce((v_item->>'strokeCount')::integer, 1))),
      'ai_enriched',
      left(nullif(trim(p_source_model), ''), 120),
      'needs_review',
      v_item
    )
    on conflict (character) do nothing;

    get diagnostics v_rows = row_count;
    v_inserted_kanji := v_inserted_kanji + v_rows;
  end loop;

  for v_item in select value from jsonb_array_elements(p_seed->'grammar')
  loop
    select catalog.jlpt_level
    into v_item_level
    from public.grammar_catalog catalog
    where catalog.pattern = trim(v_item->>'pattern')
      and catalog.active
      and (
        case catalog.jlpt_level
          when 'N5' then 1
          when 'N4' then 2
          when 'N3' then 3
          when 'N2' then 4
          when 'N1' then 5
        end
      ) <= (
        case p_level
          when 'N5' then 1
          when 'N4' then 2
          when 'N3' then 3
          when 'N2' then 4
          when 'N1' then 5
        end
      )
    order by (
      case catalog.jlpt_level
        when 'N5' then 1
        when 'N4' then 2
        when 'N3' then 3
        when 'N2' then 4
        when 'N1' then 5
      end
    ) desc
    limit 1;

    if length(trim(coalesce(v_item->>'pattern', ''))) < 1
       or length(trim(coalesce(v_item->>'meaning', ''))) < 1
       or length(trim(coalesce(v_item->>'formation', ''))) < 1
       or v_item_level is null then
      raise exception 'Invalid or out-of-catalog grammar enrichment'
        using errcode = '22023';
    end if;

    insert into public.grammar_records (
      pattern,
      jlpt_level,
      meaning,
      formation,
      usage_notes,
      nuance,
      example_sentences,
      source_type,
      source_model,
      quality_status,
      source_payload
    ) values (
      trim(v_item->>'pattern'),
      v_item_level,
      trim(v_item->>'meaning'),
      trim(v_item->>'formation'),
      coalesce(v_item->>'usageNotes', ''),
      coalesce(v_item->>'nuance', ''),
      coalesce(array(select jsonb_array_elements_text(v_item->'exampleSentences')), '{}'),
      'ai_enriched',
      left(nullif(trim(p_source_model), ''), 120),
      'needs_review',
      v_item
    )
    on conflict (pattern, jlpt_level) do nothing;

    get diagnostics v_rows = row_count;
    v_inserted_grammar := v_inserted_grammar + v_rows;
  end loop;

  for v_item in select value from jsonb_array_elements(p_seed->'vocabulary')
  loop
    if length(trim(coalesce(v_item->>'writtenForm', ''))) < 1
       or length(trim(coalesce(v_item->>'reading', ''))) < 1
       or length(trim(coalesce(v_item->>'meaning', ''))) < 1
       or length(trim(coalesce(v_item->>'partOfSpeech', ''))) < 1
       or (
         v_item ? 'linkedKanjiCharacters'
         and jsonb_typeof(v_item->'linkedKanjiCharacters') <> 'array'
       ) then
      raise exception 'Invalid vocabulary enrichment' using errcode = '22023';
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_item->'linkedKanjiCharacters', '[]'::jsonb)
      ) characters(value)
      where not exists (
        select 1
        from public.kanji_records record
        where record.character = characters.value
          and record.archived_at is null
          and record.quality_status <> 'rejected'
      )
    ) then
      raise exception 'Vocabulary references an unknown kanji'
        using errcode = '22023';
    end if;

    select coalesce(array_agg(record.id), '{}')
    into v_linked_kanji
    from public.kanji_records record
    where record.character in (
      select jsonb_array_elements_text(
        coalesce(v_item->'linkedKanjiCharacters', '[]'::jsonb)
      )
    )
      and record.archived_at is null
      and record.quality_status <> 'rejected';

    insert into public.vocabulary_records (
      written_form,
      reading,
      meaning,
      part_of_speech,
      jlpt_level,
      tags,
      example_sentence,
      linked_kanji_ids,
      source_type,
      source_model,
      quality_status,
      source_payload
    ) values (
      trim(v_item->>'writtenForm'),
      trim(v_item->>'reading'),
      trim(v_item->>'meaning'),
      trim(v_item->>'partOfSpeech'),
      p_level,
      coalesce(array(select jsonb_array_elements_text(v_item->'tags')), '{}'),
      coalesce(v_item->>'exampleSentence', ''),
      v_linked_kanji,
      'ai_enriched',
      left(nullif(trim(p_source_model), ''), 120),
      'needs_review',
      v_item
    )
    on conflict (written_form, reading, meaning) do nothing;

    get diagnostics v_rows = row_count;
    v_inserted_vocabulary := v_inserted_vocabulary + v_rows;
  end loop;

  return jsonb_build_object(
    'inserted', jsonb_build_object(
      'kanji', v_inserted_kanji,
      'grammar', v_inserted_grammar,
      'vocabulary', v_inserted_vocabulary
    )
  );
end
$$;

create or replace function public.get_learner_progress_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_level public.jlpt_level;
  v_levels public.jlpt_level[];
  v_total_kanji integer;
  v_mastered_kanji integer;
  v_total_grammar integer;
  v_mastered_grammar integer;
  v_dimension_count integer;
  v_level_completion integer;
begin
  select current_jlpt_level
  into v_level
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_levels := case v_level
    when 'N5' then array['N5']::public.jlpt_level[]
    when 'N4' then array['N5', 'N4']::public.jlpt_level[]
    when 'N3' then array['N5', 'N4', 'N3']::public.jlpt_level[]
    when 'N2' then array['N5', 'N4', 'N3', 'N2']::public.jlpt_level[]
    else array['N5', 'N4', 'N3', 'N2', 'N1']::public.jlpt_level[]
  end;

  select count(*)
  into v_total_kanji
  from public.kanji_catalog catalog
  where catalog.active
    and catalog.jlpt_level = any(v_levels);

  select count(distinct mastery.item_key)
  into v_mastered_kanji
  from public.learner_mastery mastery
  join public.kanji_records kanji_record
    on kanji_record.id::text = mastery.item_key
  join public.kanji_catalog catalog
    on catalog.character = kanji_record.character
   and catalog.jlpt_level = kanji_record.jlpt_level
   and catalog.active
  where mastery.user_id = auth.uid()
    and mastery.item_type = 'kanji'
    and mastery.mastery >= 70
    and kanji_record.jlpt_level = any(v_levels);

  select count(*)
  into v_total_grammar
  from public.grammar_catalog catalog
  where catalog.active
    and catalog.jlpt_level = any(v_levels);

  select count(distinct mastery.item_key)
  into v_mastered_grammar
  from public.learner_mastery mastery
  join public.grammar_records grammar_record
    on grammar_record.id::text = mastery.item_key
  join public.grammar_catalog catalog
    on catalog.pattern = grammar_record.pattern
   and catalog.jlpt_level = grammar_record.jlpt_level
   and catalog.active
  where mastery.user_id = auth.uid()
    and mastery.item_type = 'grammar'
    and mastery.mastery >= 70
    and grammar_record.jlpt_level = any(v_levels);

  v_dimension_count :=
    case when v_total_kanji > 0 then 1 else 0 end
    + case when v_total_grammar > 0 then 1 else 0 end;

  v_level_completion := case
    when v_dimension_count = 0 then 0
    else least(
      100,
      round(
        100 * (
          case
            when v_total_kanji > 0
              then v_mastered_kanji::numeric / v_total_kanji
            else 0
          end
          + case
              when v_total_grammar > 0
                then v_mastered_grammar::numeric / v_total_grammar
              else 0
            end
        ) / v_dimension_count
      )::integer
    )
  end;

  return jsonb_build_object(
    'level', v_level,
    'level_completion', v_level_completion,
    'learned_vocabulary', (
      select count(*)
      from public.learner_mastery
      where user_id = auth.uid()
        and item_type = 'vocabulary'
        and mastery >= 70
    ),
    'learned_kanji', (
      select count(*)
      from public.learner_mastery
      where user_id = auth.uid()
        and item_type = 'kanji'
        and mastery >= 70
    ),
    'learned_grammar', (
      select count(*)
      from public.learner_mastery
      where user_id = auth.uid()
        and item_type = 'grammar'
        and mastery >= 70
    )
  );
end
$$;

revoke all on function public.normalize_lesson_topic(text) from public;
revoke all on function public.mastery_prompt_data(text, text) from public;
revoke all on function public.record_mastery_evidence(uuid, jsonb) from public;
revoke all on function public.apply_review_answer_mastery() from public;
revoke all on function public.begin_custom_lesson_generation_v3(text, public.jlpt_level) from public;
revoke all on function public.enrich_custom_lesson_library_v2(public.jlpt_level, jsonb, text) from public;
revoke all on function public.get_learner_progress_summary() from public;

grant execute on function public.normalize_lesson_topic(text) to authenticated;
grant execute on function public.record_mastery_evidence(uuid, jsonb) to authenticated;
grant execute on function public.begin_custom_lesson_generation_v3(text, public.jlpt_level) to authenticated;
grant execute on function public.enrich_custom_lesson_library_v2(public.jlpt_level, jsonb, text) to authenticated;
grant execute on function public.get_learner_progress_summary() to authenticated;
