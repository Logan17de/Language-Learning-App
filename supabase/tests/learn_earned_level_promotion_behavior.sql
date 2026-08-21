-- JLPT level is earned, awarded once per level, and never reversed.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create or replace function pg_temp.make_learner(p_level text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'promo-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  -- Setting the level seeds level-scoped mastery through the profile trigger.
  update public.profiles
  set current_jlpt_level = p_level::public.jlpt_level, status = 'active'
  where id = v_user;
  return v_user;
end $$;

-- A grammar item at a chosen level, tracked for the learner.
create or replace function pg_temp.track_item(
  p_user uuid, p_level text, p_mastery integer
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.grammar_records (id, pattern, meaning, formation, usage_notes, jlpt_level)
  values (v_id, 'promo-' || replace(v_id::text, '-', ''), 'fixture', 'fixture',
          'fixture', p_level::public.jlpt_level);
  insert into public.learner_mastery (user_id, item_type, item_key, mastery, evidence_count)
  values (p_user, 'grammar', v_id::text, p_mastery, 1)
  on conflict (user_id, item_type, item_key) do update
    set mastery = excluded.mastery, evidence_count = 1;
  return v_id;
end $$;

create or replace function pg_temp.claim(p_user uuid)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.claim_level_promotion() into v_result;
  return v_result;
end $$;

create or replace function pg_temp.level_of(p_user uuid)
returns text language sql as $$
  select current_jlpt_level::text from public.profiles where id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- The ledger and the level column are server-owned.
-- ---------------------------------------------------------------------------
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'current_jlpt_level', 'UPDATE'),
  'a learner cannot assign themselves a JLPT level');
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'a learner can still edit their own profile fields');
select ok(
  not has_table_privilege('authenticated', 'public.learner_level_promotions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.learner_level_promotions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.learner_level_promotions', 'DELETE'),
  'the promotion ledger is not writable by the browser role');
select ok(
  has_function_privilege('authenticated', 'public.claim_level_promotion()', 'EXECUTE'),
  'a learner may claim a promotion they have earned');

-- ---------------------------------------------------------------------------
-- An unfinished level does not promote.
-- ---------------------------------------------------------------------------
select set_config('aiko.partial', pg_temp.make_learner('N5')::text, true);
select pg_temp.track_item(current_setting('aiko.partial')::uuid, 'N5', 100);
select pg_temp.track_item(current_setting('aiko.partial')::uuid, 'N5', 79);

select is(
  (pg_temp.claim(current_setting('aiko.partial')::uuid) ->> 'promoted'),
  'false', 'a level with an unmastered item does not promote');
select is(
  (pg_temp.claim(current_setting('aiko.partial')::uuid) ->> 'reason'),
  'in_progress', 'the learner is told the level is still in progress');
select is(
  pg_temp.level_of(current_setting('aiko.partial')::uuid),
  'N5', 'their level is unchanged');

-- One more point of mastery is enough.
update public.learner_mastery set mastery = 80
where user_id = current_setting('aiko.partial')::uuid and mastery = 79;

select is(
  (pg_temp.claim(current_setting('aiko.partial')::uuid) ->> 'promoted'),
  'true', 'mastering the last item promotes the learner');
select is(
  pg_temp.level_of(current_setting('aiko.partial')::uuid),
  'N4', 'the profile level advanced exactly one step');

-- ---------------------------------------------------------------------------
-- Once per level, and never backwards.
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.learner_level_promotions
   where user_id = current_setting('aiko.partial')::uuid),
  1, 'the award is recorded once');

-- Re-running must not advance again, even though N4 has nothing tracked.
select is(
  (pg_temp.claim(current_setting('aiko.partial')::uuid) ->> 'promoted'),
  'false', 'claiming again does not promote a second time');
select is(
  pg_temp.level_of(current_setting('aiko.partial')::uuid),
  'N4', 'the level is still N4 after a repeated claim');
select is(
  (select count(*)::int from public.learner_level_promotions
   where user_id = current_setting('aiko.partial')::uuid),
  1, 'no duplicate award row is written');

-- ---------------------------------------------------------------------------
-- A lapse on an EARLIER level must not block or reverse progress. Those items
-- are handled by target selection, which draws from the current level plus
-- every level below it and picks the weakest first.
-- ---------------------------------------------------------------------------
select set_config('aiko.lapsed', pg_temp.make_learner('N4')::text, true);
select pg_temp.track_item(current_setting('aiko.lapsed')::uuid, 'N4', 100);
select pg_temp.track_item(current_setting('aiko.lapsed')::uuid, 'N5', 40);

select is(
  (pg_temp.claim(current_setting('aiko.lapsed')::uuid) ->> 'promoted'),
  'true', 'an earlier-level lapse does not block the next promotion');
select is(
  pg_temp.level_of(current_setting('aiko.lapsed')::uuid),
  'N3', 'the learner still advances');
select ok(
  (select mastery from public.learner_mastery
   where user_id = current_setting('aiko.lapsed')::uuid and mastery = 40) < 80,
  'the lapsed earlier item stays below the threshold, so it remains a target');

-- ---------------------------------------------------------------------------
-- Nothing tracked, and the top of the ladder.
-- ---------------------------------------------------------------------------
select set_config('aiko.fresh', pg_temp.make_learner('N5')::text, true);
delete from public.learner_mastery where user_id = current_setting('aiko.fresh')::uuid;
select is(
  (pg_temp.claim(current_setting('aiko.fresh')::uuid) ->> 'promoted'),
  'false', 'a learner with nothing tracked is not promoted');

select set_config('aiko.top', pg_temp.make_learner('N1')::text, true);
select pg_temp.track_item(current_setting('aiko.top')::uuid, 'N1', 100);
select is(
  (pg_temp.claim(current_setting('aiko.top')::uuid) ->> 'reason'),
  'max_level', 'N1 is the top of the ladder');
select is(
  pg_temp.level_of(current_setting('aiko.top')::uuid),
  'N1', 'the top level is never changed');

select * from finish();
rollback;
