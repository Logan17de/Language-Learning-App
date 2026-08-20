-- Daily generation quota + Resume separation behavioral regression.
-- Requires migrations through 20260820023100. Everything rolls back.

begin;

select set_config('aiko.quota_free', gen_random_uuid()::text, true);
select set_config('aiko.quota_paid', gen_random_uuid()::text, true);
select set_config('aiko.quota_free_session', gen_random_uuid()::text, true);
select set_config('aiko.quota_paid_session', gen_random_uuid()::text, true);

select set_config('aiko.quota_lesson', fixture.lesson_id::text, true),
       set_config('aiko.quota_version', fixture.lesson_version_id::text, true)
from (
  select assignment.lesson_id, assignment.lesson_version_id
  from public.lesson_assignments assignment
  where assignment.selection_mode = 'custom_topic'
  order by assignment.created_at desc
  limit 1
) fixture;

do $$
begin
  if current_setting('aiko.quota_lesson', true) is null then
    raise exception 'Custom-topic lesson fixture is required';
  end if;
end
$$;

insert into auth.users (
  id, aud, role, email, raw_user_meta_data, created_at, updated_at
) values
  (
    current_setting('aiko.quota_free')::uuid,
    'authenticated', 'authenticated',
    'quota-free-' || replace(current_setting('aiko.quota_free'), '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  ),
  (
    current_setting('aiko.quota_paid')::uuid,
    'authenticated', 'authenticated',
    'quota-paid-' || replace(current_setting('aiko.quota_paid'), '-', '') || '@invalid.local',
    '{}'::jsonb, now(), now()
  );

update public.profiles
set status='active', timezone='UTC'
where id in (
  current_setting('aiko.quota_free')::uuid,
  current_setting('aiko.quota_paid')::uuid
);
update public.profiles
set subscription_plan='premium'
where id=current_setting('aiko.quota_paid')::uuid;

-- Both users have an unfinished lesson from yesterday. It must remain resumable
-- regardless of today's request count.
insert into public.custom_lesson_requests (
  user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
  status, generated_lesson_id, entitlement_local_date, entitlement_timezone,
  uses_free_daily_entitlement, entitlement_consumed_at, created_at, updated_at
) values
  (
    current_setting('aiko.quota_free')::uuid,
    'Free unfinished yesterday', 'N5', 30, 'balanced', 'medium',
    'approved', current_setting('aiko.quota_lesson')::uuid,
    (now() at time zone 'UTC')::date - 1, 'UTC', true,
    now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'
  ),
  (
    current_setting('aiko.quota_paid')::uuid,
    'Paid unfinished yesterday', 'N5', 30, 'balanced', 'medium',
    'approved', current_setting('aiko.quota_lesson')::uuid,
    (now() at time zone 'UTC')::date - 1, 'UTC', false,
    null, now() - interval '1 day', now() - interval '1 day'
  );

insert into public.lesson_assignments (
  user_id, lesson_id, lesson_version_id, selection_mode, status,
  algorithm_version, assigned_at, started_at
) values
  (
    current_setting('aiko.quota_free')::uuid,
    current_setting('aiko.quota_lesson')::uuid,
    current_setting('aiko.quota_version')::uuid,
    'custom_topic', 'started', 'quota-free-resume-test',
    now() - interval '1 day', now() - interval '1 day'
  ),
  (
    current_setting('aiko.quota_paid')::uuid,
    current_setting('aiko.quota_lesson')::uuid,
    current_setting('aiko.quota_version')::uuid,
    'custom_topic', 'started', 'quota-paid-resume-test',
    now() - interval '1 day', now() - interval '1 day'
  );

insert into public.lesson_sessions (
  id,user_id,lesson_id,lesson_version_id,status,current_phase,current_phase_index,
  activity_index,elapsed_seconds,checkpoint,started_at,last_saved_at
) values
  (
    current_setting('aiko.quota_free_session')::uuid,
    current_setting('aiko.quota_free')::uuid,
    current_setting('aiko.quota_lesson')::uuid,
    current_setting('aiko.quota_version')::uuid,
    'active','vocabulary',1,0,0,
    jsonb_build_object('session',jsonb_build_object('completedPhaseIds',jsonb_build_array('story'),'storyComplete',true,'completed',false)),
    now()-interval '1 day',now()-interval '1 day'
  ),
  (
    current_setting('aiko.quota_paid_session')::uuid,
    current_setting('aiko.quota_paid')::uuid,
    current_setting('aiko.quota_lesson')::uuid,
    current_setting('aiko.quota_version')::uuid,
    'active','vocabulary',1,0,0,
    jsonb_build_object('session',jsonb_build_object('completedPhaseIds',jsonb_build_array('story'),'storyComplete',true,'completed',false)),
    now()-interval '1 day',now()-interval '1 day'
  );

-- Free with no creation today: Resume + Start new available.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('aiko.quota_free'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare s jsonb;
begin
  s:=public.get_lesson_creation_state();
  if coalesce((s->>'can_create')::boolean,false) is not true
     or (s->>'daily_limit')::integer<>1
     or s->>'resume_lesson_id'<>current_setting('aiko.quota_lesson') then
    raise exception 'Free prior-day Resume + Start new state failed: %',s;
  end if;
end
$$;
reset role;

-- Reserve today's Free allowance, then prove begin() resumes that reservation
-- instead of creating a second request. Resume from yesterday remains visible.
insert into public.custom_lesson_requests (
  user_id,topic,jlpt_level,duration_minutes,focus,speaking_difficulty,status,
  entitlement_local_date,entitlement_timezone,uses_free_daily_entitlement,
  created_at,updated_at
) values (
  current_setting('aiko.quota_free')::uuid,
  'Free today reserved','N5',30,'balanced','medium','generation_pending',
  (now() at time zone 'UTC')::date,'UTC',true,now(),now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('aiko.quota_free'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare s jsonb; r jsonb; before_count integer; after_count integer;
begin
  s:=public.get_lesson_creation_state();
  if coalesce((s->>'can_create')::boolean,true) is not false
     or (s->>'creations_today')::integer<>1
     or s->>'resume_lesson_id'<>current_setting('aiko.quota_lesson') then
    raise exception 'Free same-day quota/Resume state failed: %',s;
  end if;

  select count(*)::integer into before_count
  from public.custom_lesson_requests
  where user_id=auth.uid();

  r:=public.begin_custom_lesson_generation_v5('Must not consume a second slot','N5');

  select count(*)::integer into after_count
  from public.custom_lesson_requests
  where user_id=auth.uid();

  if r->>'outcome'<>'resume_request' or after_count<>before_count then
    raise exception 'Free begin RPC bypassed 1/day: result %, before %, after %',r,before_count,after_count;
  end if;
end
$$;
reset role;

-- Paid 4/5 today: Resume + Start new available.
insert into public.custom_lesson_requests (
  user_id,topic,jlpt_level,duration_minutes,focus,speaking_difficulty,status,
  entitlement_local_date,entitlement_timezone,uses_free_daily_entitlement,
  created_at,updated_at
)
select
  current_setting('aiko.quota_paid')::uuid,
  'Paid today '||n,'N5',30,'balanced','medium','generation_pending',
  (now() at time zone 'UTC')::date,'UTC',false,
  now()-make_interval(mins=>10-n),now()
from generate_series(1,4) n;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('aiko.quota_paid'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare s jsonb;
begin
  s:=public.get_lesson_creation_state();
  if (s->>'creations_today')::integer<>4
     or coalesce((s->>'can_create')::boolean,false) is not true
     or s->>'resume_lesson_id'<>current_setting('aiko.quota_lesson') then
    raise exception 'Paid 4/5 Resume + Start new state failed: %',s;
  end if;
end
$$;
reset role;

-- Paid 5/5 today: Resume remains, Start new is disabled, and begin() returns
-- the authoritative Premium daily-limit outcome without inserting request #6.
insert into public.custom_lesson_requests (
  user_id,topic,jlpt_level,duration_minutes,focus,speaking_difficulty,status,
  entitlement_local_date,entitlement_timezone,uses_free_daily_entitlement,
  created_at,updated_at
) values (
  current_setting('aiko.quota_paid')::uuid,
  'Paid today 5','N5',30,'balanced','medium','generation_pending',
  (now() at time zone 'UTC')::date,'UTC',false,now(),now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('aiko.quota_paid'),true);
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare s jsonb; r jsonb; before_count integer; after_count integer;
begin
  s:=public.get_lesson_creation_state();
  if (s->>'creations_today')::integer<>5
     or coalesce((s->>'can_create')::boolean,true) is not false
     or s->>'resume_lesson_id'<>current_setting('aiko.quota_lesson') then
    raise exception 'Paid 5/5 Resume state failed: %',s;
  end if;

  select count(*)::integer into before_count
  from public.custom_lesson_requests
  where user_id=auth.uid();

  r:=public.begin_custom_lesson_generation_v5('Must not become request six','N5');

  select count(*)::integer into after_count
  from public.custom_lesson_requests
  where user_id=auth.uid();

  if r->>'outcome'<>'limit'
     or r->>'code'<>'PREMIUM_DAILY_LIMIT'
     or after_count<>before_count then
    raise exception 'Paid begin RPC bypassed 5/day: result %, before %, after %',r,before_count,after_count;
  end if;
end
$$;
reset role;

select 'daily quota + Resume behavior passed' as result;
rollback;
