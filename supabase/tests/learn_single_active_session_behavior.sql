-- A learner holds one open lesson, whichever browser asks, and being taken
-- over is final: the lesson left behind is closed and drops off the path.
--
-- Hermetic: every fixture is built inside this transaction and rolled back.

begin;
create extension if not exists pgtap;

select plan(12);

select ok(
  position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.start_or_resume_lesson_session(uuid,uuid)'::regprocedure
    )
  ) > 0,
  'lesson takeover is serialized per learner'
);

create or replace function pg_temp.make_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (v_user, 'authenticated', 'authenticated',
          'session-' || replace(v_user::text, '-', '') || '@invalid.local',
          '{}'::jsonb, now(), now());
  update public.profiles set status = 'active' where id = v_user;
  return v_user;
end $$;

-- Own fixtures rather than borrowed seed rows: the seeded database has only
-- one lesson with a version, so the second lesson has to be made here. The
-- assignment comes with it, because the learner's path is what these tests are
-- about.
create or replace function pg_temp.make_lesson(p_user uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'session-' || replace(v_lesson::text, '-', ''),
    'Session fixture', '課', 'Hermetic fixture lesson.',
    'session fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status
  ) values (p_user, v_lesson, v_version, 'custom_topic', 'assigned');
  return v_lesson;
end $$;

create or replace function pg_temp.open_lesson(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare
  v_version uuid;
  v_result jsonb;
begin
  select id into v_version from public.lesson_versions where lesson_id = p_lesson limit 1;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.start_or_resume_lesson_session(p_lesson, v_version) into v_result;
  return (v_result ->> 'id')::uuid;
end $$;

create or replace function pg_temp.open_count(p_user uuid)
returns integer language sql as $$
  select count(*)::integer from public.lesson_sessions
  where user_id = p_user and status = 'active';
$$;

create or replace function pg_temp.path_status(p_user uuid, p_lesson uuid)
returns text language sql as $$
  select status from public.lesson_assignments
  where user_id = p_user and lesson_id = p_lesson;
$$;

select set_config('aiko.learner', pg_temp.make_learner()::text, true);
select set_config('aiko.lesson_a',
  pg_temp.make_lesson(current_setting('aiko.learner')::uuid)::text, true);
select set_config('aiko.lesson_b',
  pg_temp.make_lesson(current_setting('aiko.learner')::uuid)::text, true);
select set_config('aiko.lesson_c',
  pg_temp.make_lesson(current_setting('aiko.learner')::uuid)::text, true);

-- ---------------------------------------------------------------------------
-- Opening a lesson twice reuses one session rather than making a second.
-- ---------------------------------------------------------------------------
select set_config('aiko.first',
  pg_temp.open_lesson(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_a')::uuid)::text, true);
select is(pg_temp.open_count(current_setting('aiko.learner')::uuid), 1,
  'opening a lesson gives the learner one open session');

select is(
  pg_temp.open_lesson(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_a')::uuid),
  current_setting('aiko.first')::uuid,
  'a second browser opening the same lesson joins the same session');
select is(pg_temp.open_count(current_setting('aiko.learner')::uuid), 1,
  'and does not add another');

-- ---------------------------------------------------------------------------
-- Starting another lesson closes the first, and takes it off the path.
-- ---------------------------------------------------------------------------
select set_config('aiko.second',
  pg_temp.open_lesson(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_b')::uuid)::text, true);
select is(pg_temp.open_count(current_setting('aiko.learner')::uuid), 1,
  'starting another lesson leaves exactly one open');
select is(
  (select status::text from public.lesson_sessions
    where id = current_setting('aiko.first')::uuid),
  'abandoned', 'the lesson left behind is closed');
select is(
  pg_temp.path_status(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_a')::uuid),
  'abandoned', 'and it is off the learner''s path');
select is(
  pg_temp.path_status(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_b')::uuid),
  'started', 'while the lesson now open is on it');

-- ---------------------------------------------------------------------------
-- Going back to the lesson that was set aside is refused, rather than taking
-- the open slot away from the newer one.
-- ---------------------------------------------------------------------------
select throws_ok(
  format('select pg_temp.open_lesson(%L::uuid, %L::uuid)',
         current_setting('aiko.learner'), current_setting('aiko.lesson_a')),
  '42501',
  'This lesson was set aside when another lesson was opened',
  'returning to a set-aside lesson is refused');
select is(
  (select status::text from public.lesson_sessions
    where id = current_setting('aiko.second')::uuid),
  'active', 'and the newer lesson keeps the open slot');
select is(pg_temp.open_count(current_setting('aiko.learner')::uuid), 1,
  'so the learner still holds exactly one');

-- ---------------------------------------------------------------------------
-- A finished lesson is not a set-aside one: it starts over.
-- ---------------------------------------------------------------------------
select set_config('aiko.third',
  pg_temp.open_lesson(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_c')::uuid)::text, true);
update public.lesson_sessions set status = 'completed', completed_at = now()
where id = current_setting('aiko.third')::uuid;

select isnt(
  pg_temp.open_lesson(current_setting('aiko.learner')::uuid,
                      current_setting('aiko.lesson_c')::uuid),
  current_setting('aiko.third')::uuid,
  'a completed lesson starts a new session rather than reopening the old one');

select * from finish();
rollback;
