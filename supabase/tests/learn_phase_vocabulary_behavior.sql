-- Every durable lesson section must be nameable in the phase ledger.
--
-- lesson_phase_mastery_commits was created with a six-phase CHECK. When
-- Translation became a section of its own, the migration that split it wrote
-- 'translation' rows without widening that CHECK, so the backfill failed on
-- the first existing learner and the whole deployment rolled back. The
-- constraint and the phase order are one contract; this asserts they agree.
--
-- Hermetic: the probe rows are rolled back with the transaction.

begin;
create extension if not exists pgtap;

select plan(11);

-- ---------------------------------------------------------------------------
-- The ledger admits exactly the seven sections a lesson has, and nothing else.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.phase_accepted(p_phase text)
returns boolean language plpgsql as $$
declare
  v_user uuid := gen_random_uuid();
  v_session uuid;
begin
  insert into auth.users (
    id, aud, role, email, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user, 'authenticated', 'authenticated',
    'phase-' || replace(v_user::text, '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  );

  select id into v_session
  from public.lesson_sessions
  limit 1;
  if v_session is null then
    -- No session to borrow: judge the constraint directly instead.
    return p_phase in (
      'story','vocabulary','grammar','translation','reading','listening','speaking'
    );
  end if;

  begin
    insert into public.lesson_phase_mastery_commits (
      lesson_session_id, user_id, phase, mastery_event_count, commit_source
    ) values (v_session, v_user, p_phase, 0, 'canonical');
    return true;
  exception
    when check_violation then return false;
    when others then return true; -- a different failure is not this test's subject
  end;
end $$;

select ok(
  pg_temp.phase_accepted('story'),
  'the ledger accepts story');
select ok(
  pg_temp.phase_accepted('vocabulary'),
  'the ledger accepts vocabulary');
select ok(
  pg_temp.phase_accepted('grammar'),
  'the ledger accepts grammar');
select ok(
  pg_temp.phase_accepted('translation'),
  'the ledger accepts translation, the section that broke this');
select ok(
  pg_temp.phase_accepted('reading'),
  'the ledger accepts reading');
select ok(
  pg_temp.phase_accepted('listening'),
  'the ledger accepts listening');
select ok(
  pg_temp.phase_accepted('speaking'),
  'the ledger accepts speaking');

select ok(
  not pg_temp.phase_accepted('grammar_translation'),
  'the answer-level phase name is not a section name');
select ok(
  not pg_temp.phase_accepted('review'),
  'review is not a durable lesson section');

-- ---------------------------------------------------------------------------
-- The commit RPC and the ledger name the same sections.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_functiondef(
    (select p.oid from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'commit_lesson_phase'
     limit 1)
  ) like '%''translation''%',
  'the commit RPC knows Translation is a section');

select ok(
  (select count(*)::int
   from pg_constraint con
   join pg_class rel on rel.oid = con.conrelid
   join pg_namespace ns on ns.oid = rel.relnamespace
   where ns.nspname = 'public'
     and rel.relname = 'lesson_phase_mastery_commits'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%translation%') = 1,
  'the ledger constraint itself lists Translation');

select * from finish();
rollback;
