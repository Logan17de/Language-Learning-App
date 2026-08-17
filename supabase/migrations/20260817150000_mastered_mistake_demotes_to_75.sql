-- Mastery >= 80 means learned. A real mistake on an item that is currently
-- learned must immediately make that item eligible for correction again.
--
-- Normal below-threshold learning still uses the existing +/- deltas. The only
-- special case is an incorrect answer while mastery is already >= 80: kanji and
-- grammar are demoted to exactly 75. This applies both inside lessons and in the
-- quick-review path.

-- Patch the latest lesson evidence function without duplicating its full body.
do $migration$
declare
  v_body text;
  v_before text;
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.record_mastery_evidence(uuid,jsonb)'
  );

  if v_body is null then
    raise exception 'record_mastery_evidence(uuid,jsonb) is unavailable';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    '  v_answered_correctly boolean;',
    '  v_answered_correctly boolean;' || E'\n' || '  v_demote_mastered boolean;'
  );
  if v_body = v_before then
    raise exception 'Could not add mastered-mistake state to record_mastery_evidence';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'    on conflict (user_id, item_type, item_key) do nothing;\n\n    if v_grammar_kanji_context then',
    E'    on conflict (user_id, item_type, item_key) do nothing;\n\n'
      || E'    select coalesce(mastery >= 80, false)\n'
      || E'      and v_item_type in (''kanji'', ''grammar'')\n'
      || E'      and v_signal in (''incorrect'', ''pronunciation_incorrect'')\n'
      || E'    into v_demote_mastered\n'
      || E'    from public.learner_mastery\n'
      || E'    where user_id = auth.uid()\n'
      || E'      and item_type = v_item_type\n'
      || E'      and item_key = v_item_key;\n\n'
      || E'    v_demote_mastered := coalesce(v_demote_mastered, false);\n\n'
      || E'    if v_grammar_kanji_context then'
  );
  if v_body = v_before then
    raise exception 'Could not insert mastered-mistake check into record_mastery_evidence';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'      set meaning_score = case\n            when v_dimension = ''meaning''',
    E'      set meaning_score = case\n            when v_demote_mastered then 75\n            when v_dimension = ''meaning'''
  );
  if v_body = v_before then
    raise exception 'Could not patch meaning mastery demotion';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'          recognition_score = case\n            when v_dimension = ''recognition''',
    E'          recognition_score = case\n            when v_demote_mastered then 75\n            when v_dimension = ''recognition'''
  );
  if v_body = v_before then
    raise exception 'Could not patch recognition mastery demotion';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'          pronunciation_score = case\n            when v_dimension = ''pronunciation''',
    E'          pronunciation_score = case\n            when v_demote_mastered then 75\n            when v_dimension = ''pronunciation'''
  );
  if v_body = v_before then
    raise exception 'Could not patch pronunciation mastery demotion';
  end if;

  execute format(
    'create or replace function public.record_mastery_evidence('
      || 'p_session_id uuid, p_events jsonb'
      || ') returns jsonb language plpgsql security definer '
      || 'set search_path = public as %L',
    v_body
  );
end
$migration$;

-- Quick review must obey the same learned -> weak transition. Kanji needs all
-- three component scores moved to 75; otherwise its 40/40/20 weighted score can
-- remain >= 80 even after a wrong recognition answer.
do $migration$
declare
  v_body text;
  v_before text;
begin
  select stored_function.prosrc
  into v_body
  from pg_proc stored_function
  where stored_function.oid = to_regprocedure(
    'public.apply_review_answer_mastery()'
  );

  if v_body is null then
    raise exception 'apply_review_answer_mastery() is unavailable';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    '  v_mastery public.learner_mastery%rowtype;',
    '  v_mastery public.learner_mastery%rowtype;' || E'\n' || '  v_demote_mastered boolean;'
  );
  if v_body = v_before then
    raise exception 'Could not add mastered-mistake state to apply_review_answer_mastery';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'  if v_inserted = 0 then\n    return new;\n  end if;\n\n  update public.learner_mastery',
    E'  if v_inserted = 0 then\n    return new;\n  end if;\n\n'
      || E'  select coalesce(mastery >= 80, false)\n'
      || E'    and v_queue.item_type in (''kanji'', ''grammar'')\n'
      || E'    and not coalesce(new.correct, false)\n'
      || E'  into v_demote_mastered\n'
      || E'  from public.learner_mastery\n'
      || E'  where user_id = new.user_id\n'
      || E'    and item_type = v_queue.item_type\n'
      || E'    and item_key = v_queue.item_key;\n\n'
      || E'  v_demote_mastered := coalesce(v_demote_mastered, false);\n\n'
      || E'  update public.learner_mastery'
  );
  if v_body = v_before then
    raise exception 'Could not insert mastered-mistake check into apply_review_answer_mastery';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'  set meaning_score = case\n        when v_dimension = ''meaning''',
    E'  set meaning_score = case\n        when v_demote_mastered then 75\n        when v_dimension = ''meaning'''
  );
  if v_body = v_before then
    raise exception 'Could not patch review meaning mastery demotion';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'      recognition_score = case\n        when v_dimension = ''recognition''',
    E'      recognition_score = case\n        when v_demote_mastered then 75\n        when v_dimension = ''recognition'''
  );
  if v_body = v_before then
    raise exception 'Could not patch review recognition mastery demotion';
  end if;

  v_before := v_body;
  v_body := replace(
    v_body,
    E'      end,\n      evidence_count = evidence_count + 1,',
    E'      end,\n'
      || E'      pronunciation_score = case\n'
      || E'        when v_demote_mastered then 75\n'
      || E'        else pronunciation_score\n'
      || E'      end,\n'
      || E'      evidence_count = evidence_count + 1,'
  );
  if v_body = v_before then
    raise exception 'Could not patch review pronunciation mastery demotion';
  end if;

  execute format(
    'create or replace function public.apply_review_answer_mastery() '
      || 'returns trigger language plpgsql security definer '
      || 'set search_path = public as %L',
    v_body
  );
end
$migration$;

comment on function public.record_mastery_evidence(uuid, jsonb) is
  'Records lesson mastery evidence. Incorrect kanji/grammar answers demote currently mastered items (>=80) to 75 so one real mistake re-enters adaptive targeting.';

comment on function public.apply_review_answer_mastery() is
  'Applies quick-review mastery evidence with the same >=80 mastered-item mistake demotion to 75.';
