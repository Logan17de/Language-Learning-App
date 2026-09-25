-- A learner's selected JLPT level is a mastery ceiling, not a filter that
-- erases easier material. Every active kanji and grammar item at or below the
-- learner's level belongs to their mastery profile.
--
-- Lower levels are assumed mastered at 100 when no real learner evidence exists.
-- The learner's current level starts at 0. Real evidence always wins: once an
-- item has evidence_count > 0, later profile-level changes never overwrite its
-- observed scores. This lets an advanced learner expose and repair an old weak
-- point when normal lesson evidence lowers an easier item's mastery.

create or replace function public.sync_level_scoped_mastery_profile(
  p_user_id uuid,
  p_level public.jlpt_level
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_level is null then
    return;
  end if;

  -- Kanji mastery uses meaning + recognition + pronunciation. To represent an
  -- assumed lower-level mastery of exactly 100 under the weighted mastery
  -- trigger, all three component scores start at 100.
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
    next_review_at,
    created_at,
    updated_at
  )
  select
    p_user_id,
    'kanji',
    record.id::text,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    0,
    case when record.jlpt_level < p_level then 100 else 0 end,
    case when record.jlpt_level < p_level then 100 else 0 end,
    case when record.jlpt_level < p_level then 100 else 0 end,
    null,
    case when record.jlpt_level < p_level then now() + interval '7 days' else now() end,
    now(),
    now()
  from public.kanji_records record
  where record.jlpt_level <= p_level
    and record.archived_at is null
    and record.quality_status <> 'rejected'
  on conflict (user_id, item_type, item_key) do update
  set meaning_score = excluded.meaning_score,
      recognition_score = excluded.recognition_score,
      pronunciation_score = excluded.pronunciation_score,
      mastery = excluded.mastery,
      confidence = 0,
      next_review_at = excluded.next_review_at,
      updated_at = now()
  where public.learner_mastery.evidence_count = 0;

  -- Grammar mastery is recognition-only. Lower-level grammar therefore starts
  -- with recognition_score = 100; the existing mastery trigger derives mastery
  -- 100 while keeping meaning/pronunciation at zero.
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
    next_review_at,
    created_at,
    updated_at
  )
  select
    p_user_id,
    'grammar',
    record.id::text,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    0,
    0,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    null,
    case when record.jlpt_level < p_level then now() + interval '7 days' else now() end,
    now(),
    now()
  from public.grammar_records record
  where record.jlpt_level <= p_level
    and record.archived_at is null
    and record.quality_status <> 'rejected'
  on conflict (user_id, item_type, item_key) do update
  set meaning_score = 0,
      recognition_score = excluded.recognition_score,
      pronunciation_score = 0,
      mastery = excluded.mastery,
      confidence = 0,
      next_review_at = excluded.next_review_at,
      updated_at = now()
  where public.learner_mastery.evidence_count = 0;
end
$$;

revoke all on function public.sync_level_scoped_mastery_profile(uuid, public.jlpt_level)
  from public;

create or replace function public.sync_profile_mastery_ceiling()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_level_scoped_mastery_profile(new.id, new.current_jlpt_level);
  return new;
end
$$;

drop trigger if exists profiles_sync_mastery_ceiling on public.profiles;
create trigger profiles_sync_mastery_ceiling
after insert or update of current_jlpt_level
on public.profiles
for each row execute function public.sync_profile_mastery_ceiling();

-- Existing learners receive the same level-scoped baseline immediately.
do $migration$
declare
  v_profile record;
begin
  for v_profile in
    select id, current_jlpt_level
    from public.profiles
  loop
    perform public.sync_level_scoped_mastery_profile(
      v_profile.id,
      v_profile.current_jlpt_level
    );
  end loop;
end
$migration$;

comment on function public.sync_level_scoped_mastery_profile(uuid, public.jlpt_level) is
  'Ensures every active kanji/grammar item at or below the learner JLPT ceiling has mastery state. Lower untouched levels start at 100; the current level starts at 0; evidence-backed scores are never overwritten.';
