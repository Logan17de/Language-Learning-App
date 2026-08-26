create or replace function public.get_lesson_creation_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.custom_lesson_requests%rowtype;
  v_timezone text;
  v_local_date date;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select name into v_timezone
  from pg_timezone_names
  where name = nullif(trim(v_profile.timezone), '')
  limit 1;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_local_date := (now() at time zone v_timezone)::date;

  if v_profile.subscription_plan = 'free' then
    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_local_date = v_local_date
      and (status <> 'failed' or entitlement_consumed_at is not null)
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'plan', 'free',
      'local_date', v_local_date,
      'timezone', v_timezone,
      'can_create', v_request.id is null,
      'daily_limit', 1,
      'creations_today', case when v_request.id is null then 0 else 1 end,
      'request_id', v_request.id,
      'request_status', case when v_request.id is null then null else v_request.status::text end,
      'topic', v_request.topic,
      'level', case when v_request.id is null then null else v_request.jlpt_level::text end,
      'lesson_id', v_request.generated_lesson_id,
      'entitlement_consumed', v_request.entitlement_consumed_at is not null
    );
  end if;

  select count(*)::integer into v_count
  from public.custom_lesson_requests
  where user_id = auth.uid()
    and entitlement_local_date = v_local_date
    and status <> 'failed';

  select * into v_request
  from public.custom_lesson_requests
  where user_id = auth.uid()
    and status <> 'failed'
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'plan', 'premium',
    'local_date', v_local_date,
    'timezone', v_timezone,
    'can_create', v_count < 5,
    'daily_limit', 5,
    'creations_today', v_count,
    'request_id', v_request.id,
    'request_status', case when v_request.id is null then null else v_request.status::text end,
    'topic', v_request.topic,
    'level', case when v_request.id is null then null else v_request.jlpt_level::text end,
    'lesson_id', v_request.generated_lesson_id,
    'entitlement_consumed', false
  );
end
$$;

revoke all on function public.get_lesson_creation_state() from public;
revoke all on function public.get_lesson_creation_state() from anon;
grant execute on function public.get_lesson_creation_state() to authenticated;
