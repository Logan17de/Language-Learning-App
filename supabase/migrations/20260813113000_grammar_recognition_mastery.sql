-- Grammar mastery is pattern recognition only.
-- Correct grammar answers add +10 recognition.
-- A correct grammar answer also reinforces each tracked lesson kanji that
-- appears in that question by +2 recognition and +1 meaning.

create or replace function public.enforce_weighted_learner_mastery()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.item_type = 'grammar' then
    -- Grammar has one mastery dimension: pattern recognition.
    new.meaning_score := 0;
    new.pronunciation_score := 0;
    new.mastery := greatest(0, least(100, coalesce(new.recognition_score, 0)));
  else
    new.mastery := public.weighted_learner_mastery(
      new.meaning_score,
      new.recognition_score,
      new.pronunciation_score
    );
  end if;

  new.next_review_at := case
    when new.mastery < 60 then now()
    when new.mastery < 80 then now() + interval '1 day'
    else now() + interval '7 days'
  end;
  return new;
end
$$;

-- Normalize existing grammar rows to recognition-only mastery.
update public.learner_mastery
set meaning_score = 0,
    pronunciation_score = 0,
    mastery = greatest(0, least(100, recognition_score))
where item_type = 'grammar';

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
  v_due_at timestamptz;
  v_status text;
  v_event_data jsonb;
  v_grammar_kanji_context boolean;
  v_answered_correctly boolean;
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
    v_event_data := case
      when jsonb_typeof(v_event->'data') = 'object' then v_event->'data'
      else '{}'::jsonb
    end;

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
              coalesce(version.metadata->'targetKanjiIds', '[]'::jsonb) ? v_item_key
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

    -- Grammar is recognition-only, regardless of the legacy client dimension.
    if v_item_type = 'grammar' then
      v_dimension := 'recognition';
    end if;

    v_grammar_kanji_context :=
      v_item_type = 'kanji'
      and v_signal = 'exposure'
      and coalesce(v_event_data->>'source', '') = 'grammar';
    v_answered_correctly :=
      lower(coalesce(v_event_data->>'answeredCorrectly', 'false')) = 'true';

    v_delta := case
      when v_item_type = 'grammar' and v_signal = 'correct' then 10
      when v_item_type = 'grammar' and v_signal = 'incorrect' then -6
      when v_grammar_kanji_context and v_answered_correctly then 2
      when v_grammar_kanji_context then 0
      when v_signal = 'exposure' then 1
      when v_signal = 'revealed_reading' then -2
      when v_signal = 'revealed_meaning' then -3
      when v_signal = 'correct' then 8
      when v_signal = 'incorrect' then -6
      when v_signal = 'pronunciation_correct' then 8
      when v_signal = 'pronunciation_incorrect' then -6
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
      v_event_data,
      now()
    )
    on conflict (user_id, client_event_id) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      continue;
    end if;

    -- Keep an explicit immutable meaning event for the +1 grammar-kanji bonus.
    if v_grammar_kanji_context and v_answered_correctly then
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
        v_client_event_id || ':meaning',
        'kanji',
        v_item_key,
        'meaning',
        'exposure',
        1,
        v_event_data || jsonb_build_object('grammarKanjiMeaningBonus', true),
        now()
      )
      on conflict (user_id, client_event_id) do nothing;
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

    if v_grammar_kanji_context then
      update public.learner_mastery
      set recognition_score = case
            when v_answered_correctly
              then greatest(0, least(100, recognition_score + 2))
            else recognition_score
          end,
          meaning_score = case
            when v_answered_correctly
              then greatest(0, least(100, meaning_score + 1))
            else meaning_score
          end,
          evidence_count = evidence_count + case when v_answered_correctly then 2 else 1 end,
          last_reviewed_at = now(),
          updated_at = now()
      where user_id = auth.uid()
        and item_type = v_item_type
        and item_key = v_item_key
      returning * into v_mastery;
    else
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
    end if;

    -- The learner_mastery trigger is authoritative for mastery + next_review_at.
    select * into v_mastery
    from public.learner_mastery
    where user_id = auth.uid()
      and item_type = v_item_type
      and item_key = v_item_key;

    update public.learner_mastery
    set confidence = least(100, evidence_count * 5),
        updated_at = now()
    where id = v_mastery.id
    returning * into v_mastery;

    v_status := case
      when v_mastery.mastery >= 80 then 'mastered'
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
        when v_signal in ('incorrect', 'pronunciation_incorrect') then 'Incorrect answer'
        when v_signal in ('revealed_reading', 'revealed_meaning') then 'Used help'
        when v_grammar_kanji_context and v_answered_correctly then 'Grammar context reinforcement'
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

-- Quick-review grammar answers must reinforce recognition as well.
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
    when v_queue.item_type in ('kanji', 'grammar') then 'recognition'
    else 'meaning'
  end;
  v_delta := case
    when v_queue.item_type = 'grammar' and new.correct then 10
    when new.correct then 8
    else -6
  end;

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

  return new;
end
$$;

comment on function public.enforce_weighted_learner_mastery() is
  'Kanji/vocabulary mastery uses 40% meaning + 40% recognition + 20% pronunciation. Grammar mastery equals pattern recognition only.';
