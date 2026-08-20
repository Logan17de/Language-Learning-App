-- Canonical lesson completion scoring.
-- Client-provided score, XP, and duration stay in the RPC signature for rollout
-- compatibility only. Rewards are derived from persisted lesson evidence.

create or replace function public.complete_lesson_session(
  p_session_id uuid,
  p_score integer,
  p_xp integer,
  p_duration_minutes integer,
  p_completion_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_lesson public.lessons%rowtype;
  v_ledger public.reward_ledger%rowtype;
  v_checkpoint jsonb;
  v_result jsonb;
  v_completion_data jsonb;
  v_phase_scores jsonb;
  v_premium boolean := false;

  v_story_total integer := 0;
  v_story_pct numeric := 0;

  v_vocab_total integer := 0;
  v_vocab_answered integer := 0;
  v_vocab_correct integer := 0;
  v_vocab_pct numeric := 0;

  v_grammar_static_total integer := 0;
  v_grammar_static_answered integer := 0;
  v_grammar_static_correct integer := 0;
  v_translation_total integer := 0;
  v_translation_validated integer := 0;
  v_translation_correct integer := 0;
  v_grammar_pct numeric := 0;

  v_reading_total integer := 0;
  v_reading_answered integer := 0;
  v_reading_correct integer := 0;
  v_reading_pct numeric := 0;

  v_listening_total integer := 0;
  v_listening_answered integer := 0;
  v_listening_correct integer := 0;
  v_listening_pct numeric := 0;

  v_speaking_total integer := 0;
  v_speaking_validated integer := 0;
  v_speaking_pct numeric := 0;

  v_score integer;
  v_xp integer;
  v_duration integer;
  v_timezone text;
  v_today date;
  v_last_activity_date date;
  v_current_streak integer;
  v_new_streak integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_completion_data is null or jsonb_typeof(p_completion_data) <> 'object' then
    raise exception 'Completion data is required' using errcode = '22023';
  end if;

  select *
  into v_session
  from public.lesson_sessions
  where id = p_session_id
  for update;

  if not found or v_session.user_id <> auth.uid() then
    raise exception 'Session not found' using errcode = 'P0002';
  end if;

  select *
  into v_ledger
  from public.reward_ledger
  where reward_type = 'lesson'
    and source_id = p_session_id;

  if found then
    return v_ledger.canonical_result;
  end if;

  if v_session.status <> 'active' then
    raise exception 'Session is not active' using errcode = '55000';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_session.user_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select *
  into v_lesson
  from public.lessons
  where id = v_session.lesson_id;

  if not found or not exists (
    select 1
    from public.lesson_versions version
    where version.id = v_session.lesson_version_id
      and version.lesson_id = v_session.lesson_id
  ) then
    raise exception 'Lesson version not found' using errcode = 'P0002';
  end if;

  v_premium :=
    v_profile.subscription_plan <> 'free'
    or v_profile.role in ('admin', 'content_editor');

  v_checkpoint := v_session.checkpoint -> 'session';
  if jsonb_typeof(v_checkpoint) <> 'object'
     or coalesce((v_checkpoint ->> 'storyComplete')::boolean, false) is not true then
    raise exception 'Story must be completed before lesson completion'
      using errcode = '55000';
  end if;

  -- Story is scored from canonical base word scores. Client-supplied scoreDelta
  -- fields are ignored; only persisted reveal event types apply fixed penalties.
  select count(*)::integer
  into v_story_total
  from public.lesson_story_words word
  where word.lesson_version_id = v_session.lesson_version_id;

  if v_story_total = 0 then
    v_story_pct := 100;
  else
    with story_word_scores as (
      select
        word.id,
        greatest(
          0,
          least(
            100,
            word.meaning_score
              - 25 * count(event.id) filter (
                  where event.event_type = 'meaning-revealed'
                )
          )
        ) as meaning_score,
        greatest(
          0,
          least(
            100,
            word.recognition_score
              - 15 * count(event.id) filter (
                  where event.event_type = 'reading-revealed'
                )
              - case
                  when word.script_type <> 'kanji'
                    then 25 * count(event.id) filter (
                      where event.event_type = 'meaning-revealed'
                    )
                  else 0
                end
          )
        ) as recognition_score,
        greatest(0, least(100, word.pronunciation_score)) as pronunciation_score
      from public.lesson_story_words word
      left join public.lesson_events event
        on event.user_id = v_session.user_id
       and event.lesson_session_id = v_session.id
       and event.phase = 'story'
       and event.event_type in ('reading-revealed', 'meaning-revealed')
       and event.event_data ->> 'lineId' = word.story_line_id::text
       and (
         event.event_data ->> 'wordId' = word.id::text
         or (
           coalesce(event.event_data ->> 'wordId', '') = ''
           and event.event_data ->> 'term' = word.surface
         )
       )
      where word.lesson_version_id = v_session.lesson_version_id
      group by
        word.id,
        word.meaning_score,
        word.recognition_score,
        word.pronunciation_score,
        word.script_type
    )
    select coalesce(
      avg(round((meaning_score + recognition_score + pronunciation_score)::numeric / 3)),
      0
    )
    into v_story_pct
    from story_word_scores;
  end if;

  -- Vocabulary correctness is recomputed from selected_answer against the
  -- canonical activity answer. The learner-written `correct` flag is ignored.
  select
    count(*)::integer,
    count(answer.id)::integer,
    count(*) filter (
      where answer.id is not null
        and (
          regexp_replace(
            normalize(coalesce(answer.selected_answer, ''), NFKC),
            '\s+',
            '',
            'g'
          ) = regexp_replace(
            normalize(coalesce(activity.correct_answer, ''), NFKC),
            '\s+',
            '',
            'g'
          )
          or exists (
            select 1
            from unnest(coalesce(activity.accepted_answers, '{}'::text[])) accepted(candidate)
            where regexp_replace(
                    normalize(coalesce(answer.selected_answer, ''), NFKC),
                    '\s+',
                    '',
                    'g'
                  ) = regexp_replace(
                    normalize(coalesce(accepted.candidate, ''), NFKC),
                    '\s+',
                    '',
                    'g'
                  )
          )
        )
    )::integer
  into v_vocab_total, v_vocab_answered, v_vocab_correct
  from public.lesson_practice_activities activity
  left join public.lesson_activity_answers answer
    on answer.user_id = v_session.user_id
   and answer.lesson_session_id = v_session.id
   and answer.phase = 'vocabulary'
   and answer.activity_id = activity.id::text
  where activity.lesson_version_id = v_session.lesson_version_id
    and activity.phase = 'vocabulary';

  if v_vocab_total = 0 or v_vocab_answered <> v_vocab_total then
    raise exception 'Vocabulary practice is incomplete' using errcode = '55000';
  end if;
  v_vocab_pct := 100::numeric * v_vocab_correct / v_vocab_total;

  -- Static grammar uses the same canonical-answer comparison.
  select
    count(*)::integer,
    count(answer.id)::integer,
    count(*) filter (
      where answer.id is not null
        and (
          regexp_replace(
            normalize(coalesce(answer.selected_answer, ''), NFKC),
            '\s+',
            '',
            'g'
          ) = regexp_replace(
            normalize(coalesce(activity.correct_answer, ''), NFKC),
            '\s+',
            '',
            'g'
          )
          or exists (
            select 1
            from unnest(coalesce(activity.accepted_answers, '{}'::text[])) accepted(candidate)
            where regexp_replace(
                    normalize(coalesce(answer.selected_answer, ''), NFKC),
                    '\s+',
                    '',
                    'g'
                  ) = regexp_replace(
                    normalize(coalesce(accepted.candidate, ''), NFKC),
                    '\s+',
                    '',
                    'g'
                  )
          )
        )
    )::integer
  into
    v_grammar_static_total,
    v_grammar_static_answered,
    v_grammar_static_correct
  from public.lesson_practice_activities activity
  left join public.lesson_activity_answers answer
    on answer.user_id = v_session.user_id
   and answer.lesson_session_id = v_session.id
   and answer.phase = 'grammar'
   and answer.activity_id = activity.id::text
  where activity.lesson_version_id = v_session.lesson_version_id
    and activity.phase = 'grammar';

  if v_grammar_static_total = 0
     or v_grammar_static_answered <> v_grammar_static_total then
    raise exception 'Grammar practice is incomplete' using errcode = '55000';
  end if;

  -- Translation evaluation is server-owned. Completion requires exactly five
  -- generated questions and a serverValidated persisted result for each.
  select
    count(*)::integer,
    count(answer.id) filter (
      where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
    )::integer,
    count(*) filter (
      where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
        and answer.correct is true
    )::integer
  into
    v_translation_total,
    v_translation_validated,
    v_translation_correct
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
    raise exception 'Translation practice is incomplete' using errcode = '55000';
  end if;

  v_grammar_pct :=
    100::numeric
    * (v_grammar_static_correct + v_translation_correct)
    / (v_grammar_static_total + v_translation_total);

  -- Reading answers currently live in the persisted session checkpoint. They
  -- are matched to canonical questions and re-evaluated here.
  select
    count(*)::integer,
    count(answer.response)::integer,
    count(*) filter (
      where answer.response is not null
        and btrim(normalize(answer.response, NFKC))
          = btrim(normalize(question.answer, NFKC))
    )::integer
  into v_reading_total, v_reading_answered, v_reading_correct
  from public.lesson_reading_questions question
  left join lateral (
    select item ->> 'response' as response
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_checkpoint -> 'readingAnswers') = 'array'
          then v_checkpoint -> 'readingAnswers'
        else '[]'::jsonb
      end
    ) item
    where item ->> 'questionId' = question.id::text
    limit 1
  ) answer on true
  where question.lesson_version_id = v_session.lesson_version_id;

  if v_reading_total = 0 or v_reading_answered <> v_reading_total then
    raise exception 'Reading practice is incomplete' using errcode = '55000';
  end if;
  v_reading_pct := 100::numeric * v_reading_correct / v_reading_total;

  if v_premium then
    -- Listening ignores client `correct`; it recomputes correctness from the
    -- latest persisted selectedAnswer for each canonical activity.
    select
      count(*)::integer,
      count(answer.selected_answer)::integer,
      count(*) filter (
        where answer.selected_answer is not null
          and btrim(normalize(answer.selected_answer, NFKC))
            = btrim(normalize(activity.correct_answer, NFKC))
      )::integer
    into
      v_listening_total,
      v_listening_answered,
      v_listening_correct
    from public.lesson_listening_activities activity
    left join lateral (
      select event.event_data ->> 'selectedAnswer' as selected_answer
      from public.lesson_events event
      where event.user_id = v_session.user_id
        and event.lesson_session_id = v_session.id
        and event.phase = 'listening'
        and event.event_type = 'answer'
        and event.event_data ->> 'questionId' = activity.id::text
      order by event.occurred_at desc, event.created_at desc
      limit 1
    ) answer on true
    where activity.lesson_version_id = v_session.lesson_version_id;

    if v_listening_total = 0
       or v_listening_answered <> v_listening_total then
      raise exception 'Listening practice is incomplete' using errcode = '55000';
    end if;
    v_listening_pct := 100::numeric * v_listening_correct / v_listening_total;

    -- Speaking scores come only from the server-owned transcription/evaluation
    -- rows. Client speakingEvents and client score fields are not reward inputs.
    select
      count(*)::integer,
      count(answer.id) filter (
        where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
          and coalesce(answer.answer_data ->> 'score', '') ~ '^[0-9]+(\.[0-9]+)?$'
      )::integer,
      coalesce(
        avg(
          greatest(
            0,
            least(100, (answer.answer_data ->> 'score')::numeric)
          )
        ) filter (
          where coalesce((answer.answer_data ->> 'serverValidated')::boolean, false)
            and coalesce(answer.answer_data ->> 'score', '') ~ '^[0-9]+(\.[0-9]+)?$'
        ),
        0
      )
    into
      v_speaking_total,
      v_speaking_validated,
      v_speaking_pct
    from public.lesson_speaking_activities activity
    left join public.lesson_activity_answers answer
      on answer.user_id = v_session.user_id
     and answer.lesson_session_id = v_session.id
     and answer.phase = 'speaking'
     and answer.activity_id = activity.id::text
    where activity.lesson_version_id = v_session.lesson_version_id;

    if v_speaking_total = 0
       or v_speaking_validated <> v_speaking_total then
      raise exception 'Speaking practice is incomplete' using errcode = '55000';
    end if;
  end if;

  if v_premium then
    v_score := greatest(
      0,
      least(
        100,
        round(
          (
            v_story_pct * 15
            + v_vocab_pct * 25
            + v_grammar_pct * 25
            + v_reading_pct * 15
            + v_listening_pct * 10
            + v_speaking_pct * 10
          ) / 100
        )::integer
      )
    );
  else
    -- Free learners are normalized across the four accessible phases (80% of
    -- the six-phase weight) so gated Premium phases neither help nor hurt them.
    v_score := greatest(
      0,
      least(
        100,
        round(
          (
            v_story_pct * 15
            + v_vocab_pct * 25
            + v_grammar_pct * 25
            + v_reading_pct * 15
          ) / 80
        )::integer
      )
    );
  end if;

  v_xp := public.calculate_lesson_xp(v_score);

  -- Do not trust client elapsed time. Bound study minutes by wall-clock session
  -- age, the lesson's expected duration, and an absolute two-hour ceiling.
  v_duration := greatest(
    1,
    least(
      120,
      greatest(1, coalesce(v_lesson.duration_minutes, 30) * 2),
      greatest(
        0,
        floor(extract(epoch from (now() - v_session.started_at)) / 60)::integer
      )
    )
  );

  v_timezone := public.lesson_quota_timezone(
    v_session.user_id,
    v_profile.timezone
  );
  v_today := (now() at time zone v_timezone)::date;

  select max(activity_date)
  into v_last_activity_date
  from public.weekly_activity
  where user_id = v_session.user_id;

  v_current_streak := greatest(0, coalesce(v_profile.streak_days, 0));
  v_new_streak := case
    when v_last_activity_date = v_today
      then greatest(v_current_streak, 1)
    when v_last_activity_date = v_today - 1
      then v_current_streak + 1
    else 1
  end;

  v_phase_scores := jsonb_build_object(
    'story', round(v_story_pct),
    'vocabulary', round(v_vocab_pct),
    'grammar', round(v_grammar_pct),
    'reading', round(v_reading_pct),
    'listening', case when v_premium then round(v_listening_pct) else null end,
    'speaking', case when v_premium then round(v_speaking_pct) else null end
  );

  -- Keep legacy client metadata for diagnostics, but canonical fields below
  -- overwrite any same-named client values and are the only reward authority.
  v_completion_data := p_completion_data || jsonb_build_object(
    'canonicalScore', v_score,
    'canonicalXp', v_xp,
    'canonicalDurationMinutes', v_duration,
    'scoreEngineVersion', 'lesson-v2',
    'phaseScores', v_phase_scores,
    'premiumPhasesIncluded', v_premium,
    'activityDate', v_today,
    'activityTimezone', v_timezone
  );

  v_result := jsonb_build_object(
    'session_id', p_session_id,
    'lesson_id', v_session.lesson_id,
    'lesson_version_id', v_session.lesson_version_id,
    'score', v_score,
    'xp_awarded', v_xp,
    'duration_minutes', v_duration,
    'phase_scores', v_phase_scores,
    'premium_phases_included', v_premium,
    'streak_days', v_new_streak,
    'activity_date', v_today,
    'rewarded', true,
    'canonical', true
  );

  insert into public.lesson_completions (
    user_id,
    lesson_id,
    lesson_version_id,
    lesson_session_id,
    score,
    xp_awarded,
    duration_minutes,
    completion_data
  ) values (
    v_session.user_id,
    v_session.lesson_id,
    v_session.lesson_version_id,
    p_session_id,
    v_score,
    v_xp,
    v_duration,
    v_completion_data
  )
  on conflict (lesson_session_id) do nothing;

  insert into public.reward_ledger (
    user_id,
    reward_type,
    source_id,
    xp_awarded,
    canonical_result
  ) values (
    v_session.user_id,
    'lesson',
    p_session_id,
    v_xp,
    v_result
  )
  on conflict (reward_type, source_id) do nothing
  returning * into v_ledger;

  if not found then
    select *
    into v_ledger
    from public.reward_ledger
    where reward_type = 'lesson'
      and source_id = p_session_id;
    return v_ledger.canonical_result;
  end if;

  update public.lesson_sessions
  set status = 'completed',
      completed_at = now(),
      reward_claimed_at = now(),
      updated_at = now()
  where id = p_session_id;

  update public.lesson_assignments
  set status = 'completed',
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where user_id = v_session.user_id
    and lesson_id = v_session.lesson_id
    and lesson_version_id = v_session.lesson_version_id
    and selection_mode = 'custom_topic'
    and status in ('assigned', 'started');

  update public.profiles
  set xp = xp + v_xp,
      streak_days = v_new_streak,
      longest_streak = greatest(longest_streak, v_new_streak),
      total_study_minutes = total_study_minutes + v_duration
  where id = v_session.user_id;

  insert into public.weekly_activity (
    user_id,
    activity_date,
    minutes,
    lesson_minutes
  ) values (
    v_session.user_id,
    v_today,
    v_duration,
    v_duration
  )
  on conflict (user_id, activity_date) do update
  set minutes = public.weekly_activity.minutes + excluded.minutes,
      lesson_minutes = public.weekly_activity.lesson_minutes + excluded.lesson_minutes;

  return v_result;
end;
$$;

revoke all on function public.complete_lesson_session(
  uuid,
  integer,
  integer,
  integer,
  jsonb
) from public, anon;
grant execute on function public.complete_lesson_session(
  uuid,
  integer,
  integer,
  integer,
  jsonb
) to authenticated;

comment on function public.complete_lesson_session(
  uuid,
  integer,
  integer,
  integer,
  jsonb
) is
  'Completes a lesson idempotently using server-canonical phase evidence. Client score, XP, duration, and correct flags are not reward authority.';
