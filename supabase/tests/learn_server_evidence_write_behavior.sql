-- Server-owned completion evidence must not be forgeable by learners.
-- This test runs transactionally and leaves no fixtures behind.

begin;

select set_config('aiko.test_user', gen_random_uuid()::text, true);
select set_config(
  'aiko.test_lesson',
  (select id::text from public.lessons where current_version_id is not null limit 1),
  true
);
select set_config(
  'aiko.test_version',
  (select current_version_id::text from public.lessons where id = current_setting('aiko.test_lesson')::uuid),
  true
);
select set_config('aiko.test_session', gen_random_uuid()::text, true);

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  current_setting('aiko.test_user')::uuid,
  'authenticated',
  'authenticated',
  'server-evidence-' || replace(current_setting('aiko.test_user'), '-', '') || '@invalid.local',
  '{}'::jsonb,
  now(),
  now()
);

insert into public.lesson_assignments (
  user_id,
  lesson_id,
  lesson_version_id,
  selection_mode,
  status,
  algorithm_version
) values (
  current_setting('aiko.test_user')::uuid,
  current_setting('aiko.test_lesson')::uuid,
  current_setting('aiko.test_version')::uuid,
  'custom_topic',
  'started',
  'server-evidence-behavior-test'
);

insert into public.lesson_sessions (
  id,
  user_id,
  lesson_id,
  lesson_version_id,
  status,
  current_phase,
  current_phase_index,
  activity_index,
  elapsed_seconds,
  checkpoint
) values (
  current_setting('aiko.test_session')::uuid,
  current_setting('aiko.test_user')::uuid,
  current_setting('aiko.test_lesson')::uuid,
  current_setting('aiko.test_version')::uuid,
  'active',
  'grammar',
  2,
  0,
  0,
  '{}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('aiko.test_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    insert into public.lesson_activity_answers (
      user_id,
      lesson_session_id,
      phase,
      activity_id,
      selected_answer,
      correct,
      attempts,
      answer_data
    ) values (
      auth.uid(),
      current_setting('aiko.test_session')::uuid,
      'grammar_translation',
      'forged-translation',
      'forged',
      true,
      1,
      '{"serverValidated":true}'::jsonb
    );
    raise exception 'learner forged serverValidated grammar_translation evidence';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;

  begin
    insert into public.lesson_activity_answers (
      user_id,
      lesson_session_id,
      phase,
      activity_id,
      selected_answer,
      correct,
      attempts,
      answer_data
    ) values (
      auth.uid(),
      current_setting('aiko.test_session')::uuid,
      'speaking',
      'forged-speaking',
      'forged',
      true,
      1,
      '{"serverValidated":true,"score":100}'::jsonb
    );
    raise exception 'learner forged serverValidated speaking evidence';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
end
$$;

reset role;
select 'server-owned evidence write behavior passed' as result;
rollback;
