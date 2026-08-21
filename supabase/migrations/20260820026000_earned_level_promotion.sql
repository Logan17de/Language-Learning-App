-- JLPT level becomes earned rather than declared.
--
-- Until now current_jlpt_level was a preference: onboarding set it and the
-- learner could change it whenever they liked, including straight from the
-- API, because 20260819115000 grants update(current_jlpt_level) to
-- authenticated. That was reasonable while the level only described the
-- learner. It is not reasonable once the level is something they earn, so the
-- column becomes server-owned here and moves only through claim_level_promotion().
--
-- PROMOTION RULE
-- A learner earns the next level when every item at their current level AND at
-- every level below it has reached the learned threshold.
--
-- Earlier levels are included deliberately. If an N3 learner slips on an N5
-- kanji, that item drops below the threshold and promotion pauses until it is
-- back. It does resurface on its own: target selection draws from the current
-- level plus every level below and picks the weakest first, so the lapsed N5
-- kanji becomes a target in the next lesson. Clearing it resumes progress.
--
-- Pausing is not demotion. The learner's level never falls; only the next
-- award waits.
--
-- ONCE PER LEVEL, NEVER BACKWARDS
-- Each attained level is recorded once in learner_level_promotions. A level
-- that has already been awarded is never awarded again, and nothing in this
-- migration can lower a learner's level: promotion only ever moves forward.

create table if not exists public.learner_level_promotions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  level public.jlpt_level not null,
  promoted_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.learner_level_promotions enable row level security;

create policy learner_level_promotions_own_select
  on public.learner_level_promotions for select to authenticated
  using (user_id = auth.uid());

revoke all on public.learner_level_promotions from public, anon, authenticated;
grant select on public.learner_level_promotions to authenticated;
grant all on public.learner_level_promotions to service_role;

comment on table public.learner_level_promotions is
  'One row per level a learner has earned. Promotion is awarded once per level and never reversed.';

-- ---------------------------------------------------------------------------
-- Claim a promotion if one has been earned. Safe to call after any lesson:
-- it reports progress when nothing is due and awards at most one level.
-- ---------------------------------------------------------------------------
create or replace function public.claim_level_promotion()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_levels constant public.jlpt_level[] :=
    array['N5','N4','N3','N2','N1']::public.jlpt_level[];
  v_user uuid := auth.uid();
  v_current public.jlpt_level;
  v_next public.jlpt_level;
  v_index integer;
  v_tracked integer := 0;
  v_mastered integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select current_jlpt_level into v_current
  from public.profiles
  where id = v_user and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_index := array_position(v_levels, v_current);
  if v_index is null or v_index >= array_length(v_levels, 1) then
    return jsonb_build_object('promoted', false, 'reason', 'max_level',
                              'level', v_current);
  end if;
  v_next := v_levels[v_index + 1];

  -- Once per level: an already-awarded level is never awarded again.
  if exists (
    select 1 from public.learner_level_promotions promotion
    where promotion.user_id = v_user and promotion.level = v_next
  ) then
    return jsonb_build_object('promoted', false, 'reason', 'already_awarded',
                              'level', v_current);
  end if;

  -- Every item at the current level and at every level below it. The jlpt_level
  -- enum is declared easiest-first, so <= v_current is "at or below".
  select count(*)::integer,
         count(*) filter (
           where mastery.mastery >= 80
         )::integer
  into v_tracked, v_mastered
  from public.learner_mastery mastery
  where mastery.user_id = v_user
    and (
      (mastery.item_type = 'kanji' and exists (
        select 1 from public.kanji_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_current))
      or (mastery.item_type = 'vocabulary' and exists (
        select 1 from public.vocabulary_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_current))
      or (mastery.item_type = 'grammar' and exists (
        select 1 from public.grammar_records record
        where record.id::text = mastery.item_key
          and record.jlpt_level <= v_current))
    );

  if v_tracked = 0 or v_mastered < v_tracked then
    return jsonb_build_object(
      'promoted', false, 'reason', 'in_progress', 'level', v_current,
      'trackedItems', v_tracked, 'masteredItems', v_mastered
    );
  end if;

  insert into public.learner_level_promotions (user_id, level)
  values (v_user, v_next)
  on conflict (user_id, level) do nothing;

  update public.profiles
  set current_jlpt_level = v_next, updated_at = now()
  where id = v_user;

  return jsonb_build_object(
    'promoted', true, 'fromLevel', v_current, 'level', v_next,
    'trackedItems', v_tracked, 'masteredItems', v_mastered
  );
end;
$$;

revoke all on function public.claim_level_promotion() from public, anon;
grant execute on function public.claim_level_promotion() to authenticated, service_role;

comment on function public.claim_level_promotion() is
  'Awards the next JLPT level when every item at the current level is mastered. Once per level, never reversed.';

-- ---------------------------------------------------------------------------
-- The level is now earned, so the learner may no longer set it directly.
-- Onboarding still works: complete_onboarding() is SECURITY DEFINER and sets
-- the starting level as the function owner.
-- ---------------------------------------------------------------------------
revoke update (current_jlpt_level) on public.profiles from authenticated;

do $$
begin
  if has_column_privilege('authenticated', 'public.profiles', 'current_jlpt_level', 'UPDATE') then
    raise exception 'JLPT level must not be self-assignable once it is earned';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') then
    raise exception 'learners must still be able to edit their own profile fields';
  end if;
  if not has_function_privilege('authenticated', 'public.claim_level_promotion()', 'EXECUTE') then
    raise exception 'learners must be able to claim an earned promotion';
  end if;
  if has_table_privilege('authenticated', 'public.learner_level_promotions', 'INSERT')
     or has_table_privilege('authenticated', 'public.learner_level_promotions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.learner_level_promotions', 'DELETE') then
    raise exception 'the promotion ledger must be server-owned';
  end if;
end;
$$;
