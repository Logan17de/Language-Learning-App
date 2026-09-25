-- The newest lesson owns checkpoint writes. An older tab is refused, while a
-- newer session can repair a race that briefly left an older session active.

begin;
create extension if not exists pgtap;

select plan(12);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_authoritative_lesson_checkpoint(uuid,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated learners can save the authoritative checkpoint'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.save_authoritative_lesson_checkpoint(uuid,text,integer,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot save lesson checkpoints'
);

create or replace function pg_temp.make_checkpoint_learner()
returns uuid language plpgsql as $$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (
    v_user, 'authenticated', 'authenticated',
    'checkpoint-' || replace(v_user::text, '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  );
  update public.profiles set status = 'active' where id = v_user;
  return v_user;
end $$;

create or replace function pg_temp.make_checkpoint_lesson(p_user uuid)
returns uuid language plpgsql as $$
declare
  v_lesson uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  insert into public.lessons (
    id, slug, title, japanese_title, summary, topic, jlpt_level,
    duration_minutes, status, source, generated_for_user_id
  ) values (
    v_lesson, 'checkpoint-' || replace(v_lesson::text, '-', ''),
    'Checkpoint fixture', '課', 'Hermetic checkpoint fixture.',
    'checkpoint fixture', 'N5', 30, 'published', 'user_generated', p_user
  );
  insert into public.lesson_versions (id, lesson_id, version_number, status)
  values (v_version, v_lesson, 1, 'published');
  update public.lessons set current_version_id = v_version where id = v_lesson;
  insert into public.lesson_assignments (
    user_id, lesson_id, lesson_version_id, selection_mode, status
  ) values (p_user, v_lesson, v_version, 'custom_topic', 'assigned');
  return v_lesson;
end $$;

create or replace function pg_temp.open_checkpoint_lesson(p_user uuid, p_lesson uuid)
returns uuid language plpgsql as $$
declare
  v_version uuid;
  v_result jsonb;
begin
  select id into v_version
  from public.lesson_versions
  where lesson_id = p_lesson
  limit 1;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  select public.start_or_resume_lesson_session(p_lesson, v_version) into v_result;
  return (v_result ->> 'id')::uuid;
end $$;

select set_config('aiko.checkpoint_user', pg_temp.make_checkpoint_learner()::text, true);
select set_config(
  'aiko.checkpoint_old_lesson',
  pg_temp.make_checkpoint_lesson(current_setting('aiko.checkpoint_user')::uuid)::text,
  true
);
select set_config(
  'aiko.checkpoint_new_lesson',
  pg_temp.make_checkpoint_lesson(current_setting('aiko.checkpoint_user')::uuid)::text,
  true
);
select set_config(
  'aiko.checkpoint_old_session',
  pg_temp.open_checkpoint_lesson(
    current_setting('aiko.checkpoint_user')::uuid,
    current_setting('aiko.checkpoint_old_lesson')::uuid
  )::text,
  true
);
select set_config(
  'aiko.checkpoint_new_session',
  pg_temp.open_checkpoint_lesson(
    current_setting('aiko.checkpoint_user')::uuid,
    current_setting('aiko.checkpoint_new_lesson')::uuid
  )::text,
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.checkpoint_user'), true);

select lives_ok(
  format(
    $q$select public.save_authoritative_lesson_checkpoint(%L::uuid, 'vocabulary', 1, 0, 12, %L::jsonb)$q$,
    current_setting('aiko.checkpoint_new_session'),
    '{"session":{"completedPhaseIds":["story"],"storyComplete":true,"sequence":1}}'
  ),
  'the newest lesson saves a Story hand-off checkpoint'
);

reset role;

select is(
  (select checkpoint -> 'session' ->> 'sequence'
   from public.lesson_sessions
   where id = current_setting('aiko.checkpoint_new_session')::uuid),
  '1',
  'the newest checkpoint is stored'
);
select is(
  (select count(*)::integer
   from public.lesson_phase_mastery_commits
   where lesson_session_id = current_setting('aiko.checkpoint_new_session')::uuid),
  0,
  'a modern Story hand-off does not run the legacy checkpoint trigger'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.checkpoint_user'), true);
select throws_ok(
  format(
    $q$select public.save_authoritative_lesson_checkpoint(%L::uuid, 'story', 0, 0, 8, '{}'::jsonb)$q$,
    current_setting('aiko.checkpoint_old_session')
  ),
  '42501',
  'A newer lesson owns this checkpoint',
  'an older tab cannot overwrite the newer lesson'
);
reset role;

-- Reproduce the broken ordering the RPC is designed to heal: an old request
-- has the active flag even though the newer session has the later start time.
update public.lesson_sessions
set status = 'abandoned', updated_at = now()
where id = current_setting('aiko.checkpoint_new_session')::uuid;
update public.lesson_sessions
set status = 'active', updated_at = now()
where id = current_setting('aiko.checkpoint_old_session')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.checkpoint_user'), true);
select lives_ok(
  format(
    $q$select public.save_authoritative_lesson_checkpoint(%L::uuid, 'vocabulary', 1, 0, 18, %L::jsonb)$q$,
    current_setting('aiko.checkpoint_new_session'),
    '{"session":{"completedPhaseIds":["story"],"storyComplete":true,"sequence":2}}'
  ),
  'the newer checkpoint atomically replaces an older active session'
);
reset role;

select is(
  (select status::text from public.lesson_sessions
   where id = current_setting('aiko.checkpoint_new_session')::uuid),
  'active',
  'the genuinely newest session becomes active'
);
select is(
  (select status::text from public.lesson_sessions
   where id = current_setting('aiko.checkpoint_old_session')::uuid),
  'abandoned',
  'the older session is retired'
);
select is(
  (select count(*)::integer from public.lesson_sessions
   where user_id = current_setting('aiko.checkpoint_user')::uuid
     and status = 'active'),
  1,
  'the learner still has exactly one active session'
);
select is(
  (select status from public.lesson_assignments
   where user_id = current_setting('aiko.checkpoint_user')::uuid
     and lesson_id = current_setting('aiko.checkpoint_new_lesson')::uuid),
  'started',
  'the newer lesson is restored to the learning path'
);
select is(
  (select checkpoint -> 'session' ->> 'sequence'
   from public.lesson_sessions
   where id = current_setting('aiko.checkpoint_new_session')::uuid),
  '2',
  'the replacement save stores the new checkpoint'
);

select * from finish();
rollback;
