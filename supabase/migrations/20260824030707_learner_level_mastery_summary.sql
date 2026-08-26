-- How well the learner knows everything they are responsible for so far.
--
-- The completion screen had no measure of standing. It showed the lesson's own
-- score next to how long the lesson took, which says nothing about whether the
-- learner is getting anywhere.
--
-- This is the average mastery across every tracked item at the learner's
-- current level and at every level below it -- the same scope promotion is
-- judged on, so the number moves toward the thing it is measuring.
--
-- Deliberately an average rather than a count of items past a threshold.
-- get_learner_progress_summary already reports a count, and it counts at 70
-- while promotion requires 80, so a learner reading both would see two numbers
-- that disagree about the same idea. An average has no threshold to disagree
-- about, and it still rises as weak items are strengthened.

create or replace function public.learner_level_mastery()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_level public.jlpt_level;
  v_tracked integer := 0;
  v_mastered integer := 0;
  v_average integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select current_jlpt_level into v_level
  from public.profiles
  where id = v_user and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  -- The jlpt_level enum is declared easiest-first, so <= v_level is
  -- "at or below", the same comparison claim_level_promotion makes.
  select
    count(*)::integer,
    count(*) filter (where mastery.mastery >= 80)::integer,
    coalesce(round(avg(mastery.mastery)), 0)::integer
  into v_tracked, v_mastered, v_average
  from public.learner_mastery mastery
  where mastery.user_id = v_user
    and (
      (mastery.item_type = 'kanji' and exists (
        select 1 from public.kanji_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_level))
      or (mastery.item_type = 'vocabulary' and exists (
        select 1 from public.vocabulary_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_level))
      or (mastery.item_type = 'grammar' and exists (
        select 1 from public.grammar_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_level))
    );

  return jsonb_build_object(
    'level', v_level,
    'averageMastery', v_average,
    'trackedItems', v_tracked,
    'masteredItems', v_mastered
  );
end;
$$;

revoke all on function public.learner_level_mastery() from public, anon;
grant execute on function public.learner_level_mastery() to authenticated, service_role;

comment on function public.learner_level_mastery() is
  'Average mastery across every tracked item at the learner''s level and below, the scope promotion is judged on.';

do $$
begin
  if not has_function_privilege('authenticated', 'public.learner_level_mastery()', 'EXECUTE') then
    raise exception 'a learner must be able to read their own standing';
  end if;
  if has_function_privilege('anon', 'public.learner_level_mastery()', 'EXECUTE') then
    raise exception 'level mastery must not be readable without signing in';
  end if;
end
$$;
