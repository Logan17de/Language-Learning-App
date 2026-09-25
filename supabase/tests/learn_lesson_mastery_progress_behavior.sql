-- What one lesson moved: before, after, and the difference.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(8);

create or replace function pg_temp.make_learner(p_level text)
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'progress-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles
  set current_jlpt_level = p_level::public.jlpt_level, status = 'active'
  where id = v_user;
  delete from public.learner_mastery where user_id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.track_grammar(
  p_user uuid, p_level text, p_mastery integer
) returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.grammar_records (id, pattern, meaning, formation, usage_notes, jlpt_level)
  values (v_id, 'progress-' || replace(v_id::text, '-', ''), 'fixture', 'fixture',
          'fixture', p_level::public.jlpt_level);
  insert into public.learner_mastery (
    user_id, item_type, item_key, recognition_score, evidence_count
  )
  values (p_user, 'grammar', v_id::text, p_mastery, 1)
  on conflict (user_id, item_type, item_key) do update
    set recognition_score = excluded.recognition_score, evidence_count = 1;
  return v_id;
end $$;

create or replace function pg_temp.start_session(p_user uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid;
  v_version uuid;
  v_session uuid;
begin
  select l.id, v.id into v_lesson, v_version
  from public.lessons l
  join public.lesson_versions v on v.lesson_id = l.id
  limit 1;
  insert into public.lesson_sessions (
    user_id, lesson_id, lesson_version_id, status, current_phase,
    current_phase_index, activity_index, elapsed_seconds, checkpoint, started_at
  ) values (
    p_user, v_lesson, v_version, 'active', 'story', 0, 0, 0, '{}'::jsonb, now()
  ) returning id into v_session;
  return v_session;
end $$;

create or replace function pg_temp.progress(p_user uuid)
returns jsonb language plpgsql as $$
declare v_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.lesson_mastery_progress() into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated', 'public.lesson_mastery_progress()', 'EXECUTE'),
  'a learner can see what their lesson moved');
select ok(
  not has_function_privilege('anon', 'public.lesson_mastery_progress()', 'EXECUTE'),
  'the reading is not available without signing in');
select ok(
  not has_function_privilege('authenticated', 'public.learner_mastery_breakdown(uuid, public.jlpt_level)', 'EXECUTE'),
  'the raw breakdown is not callable for an arbitrary learner');

-- ---------------------------------------------------------------------------
-- A session records where the learner stood when it began.
-- ---------------------------------------------------------------------------
select set_config('aiko.learner', pg_temp.make_learner('N4')::text, true);
select set_config('aiko.item', pg_temp.track_grammar(current_setting('aiko.learner')::uuid, 'N4', 40)::text, true);
select set_config('aiko.session', pg_temp.start_session(current_setting('aiko.learner')::uuid)::text, true);

select is(
  (select (mastery_snapshot ->> 'grammar')::integer from public.lesson_sessions
    where id = current_setting('aiko.session')::uuid),
  40, 'the session captures the standing it started from');

-- The lesson strengthens the item, then completes.
update public.learner_mastery
set recognition_score = 70
where user_id = current_setting('aiko.learner')::uuid
  and item_key = current_setting('aiko.item');

update public.lesson_sessions
set status = 'completed', completed_at = now()
where id = current_setting('aiko.session')::uuid;

select is(
  ((pg_temp.progress(current_setting('aiko.learner')::uuid) -> 'overall') ->> 'before'),
  '40', 'the reading reports where the learner started');
select is(
  ((pg_temp.progress(current_setting('aiko.learner')::uuid) -> 'overall') ->> 'after'),
  '70', 'and where they finished');
select is(
  (pg_temp.progress(current_setting('aiko.learner')::uuid) ->> 'hasBaseline'),
  'true', 'a session started with a snapshot reports a real comparison');

-- ---------------------------------------------------------------------------
-- Mastery can fall, and the reading says so rather than hiding it.
-- ---------------------------------------------------------------------------
update public.learner_mastery
set recognition_score = 25
where user_id = current_setting('aiko.learner')::uuid
  and item_key = current_setting('aiko.item');

select ok(
  ((pg_temp.progress(current_setting('aiko.learner')::uuid) -> 'overall') ->> 'after')::integer
    < ((pg_temp.progress(current_setting('aiko.learner')::uuid) -> 'overall') ->> 'before')::integer,
  'a lesson that weakened an item reports a fall');

select * from finish();
rollback;
