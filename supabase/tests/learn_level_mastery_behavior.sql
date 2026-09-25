-- Average mastery across the learner's level and every level below it.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(9);

create or replace function pg_temp.make_learner(p_level text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'mastery-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set current_jlpt_level = p_level::public.jlpt_level, status = 'active'
  where id = v_user;
  -- Setting the level seeds a row per catalogued item; clear them so each test
  -- controls exactly what is tracked.
  delete from public.learner_mastery where user_id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.track_grammar(
  p_user uuid, p_level text, p_mastery integer
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.grammar_records (id, pattern, meaning, formation, usage_notes, jlpt_level)
  values (v_id, 'mastery-' || replace(v_id::text, '-', ''), 'fixture', 'fixture',
          'fixture', p_level::public.jlpt_level);
  -- mastery is derived from recognition_score by a trigger, so write that.
  insert into public.learner_mastery (
    user_id, item_type, item_key, recognition_score, evidence_count
  )
  values (p_user, 'grammar', v_id::text, p_mastery, 1)
  on conflict (user_id, item_type, item_key) do update
    set recognition_score = excluded.recognition_score, evidence_count = 1;
  return v_id;
end $$;

create or replace function pg_temp.summary(p_user uuid)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.learner_level_mastery() into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.learner_level_mastery()', 'EXECUTE'),
  'a learner can read their own standing');
select ok(
  not has_function_privilege('anon', 'public.learner_level_mastery()', 'EXECUTE'),
  'standing is not readable without signing in');

-- ---------------------------------------------------------------------------
-- The average spans the current level and every level below it.
-- ---------------------------------------------------------------------------
select set_config('aiko.learner', pg_temp.make_learner('N3')::text, true);
select pg_temp.track_grammar(current_setting('aiko.learner')::uuid, 'N3', 90);
select pg_temp.track_grammar(current_setting('aiko.learner')::uuid, 'N4', 60);
select pg_temp.track_grammar(current_setting('aiko.learner')::uuid, 'N5', 30);

select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'averageMastery'),
  '60', 'the average spans the current level and the ones below it');
select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'trackedItems'),
  '3', 'every item at or below the level is counted');
select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'masteredItems'),
  '1', 'mastered counts the promotion threshold, not the progress one');
select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'level'),
  'N3', 'the learner level is reported alongside the average');

-- A higher level is not the learner's responsibility yet.
select pg_temp.track_grammar(current_setting('aiko.learner')::uuid, 'N2', 0);
select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'trackedItems'),
  '3', 'an item above the learner level is not counted');
select is(
  (pg_temp.summary(current_setting('aiko.learner')::uuid) ->> 'averageMastery'),
  '60', 'and does not drag the average down');

-- ---------------------------------------------------------------------------
-- Nothing tracked is zero, not an error.
-- ---------------------------------------------------------------------------
select set_config('aiko.fresh', pg_temp.make_learner('N5')::text, true);
select is(
  (pg_temp.summary(current_setting('aiko.fresh')::uuid) ->> 'averageMastery'),
  '0', 'a learner with nothing tracked reads zero');

select * from finish();
rollback;
