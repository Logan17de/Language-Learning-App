-- Final activation switch for the /learn product contract.
--
-- The compatible frontend treats a genuinely missing activation RPC as the
-- legacy rollout state. Every intermediate migration state therefore remains
-- usable. This transaction installs the final Resume semantics first and only
-- then exposes the activation sentinel consumed by the UI/API.

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
  v_daily_limit integer := 1;
  v_creations_today integer := 0;
  v_can_create boolean := false;
  v_lesson_state text := null;
  v_resume_request_id uuid := null;
  v_resume_lesson_id uuid := null;
  v_resume_topic text := null;
  v_resume_level text := null;
  v_resume_lesson_state text := null;
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

  v_timezone := public.lesson_quota_timezone(auth.uid(), v_profile.timezone);
  v_local_date := (now() at time zone v_timezone)::date;

  if v_profile.subscription_plan = 'free' then
    v_daily_limit := 1;
    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_local_date = v_local_date
      and (status <> 'failed' or entitlement_consumed_at is not null)
    order by created_at desc
    limit 1;

    v_creations_today := case when v_request.id is null then 0 else 1 end;
    v_can_create := v_request.id is null;
  else
    v_daily_limit := 5;
    select count(*)::integer into v_count
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and entitlement_local_date = v_local_date
      and status <> 'failed';

    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and entitlement_local_date = v_local_date
      and status <> 'failed'
    order by created_at desc
    limit 1;

    v_creations_today := v_count;
    v_can_create := v_count < 5;
  end if;

  if v_request.id is not null then
    if v_request.generated_lesson_id is null then
      if v_request.status <> 'failed' then
        v_lesson_state := 'building';
      end if;
    elsif exists (
      select 1
      from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = v_request.generated_lesson_id
    ) then
      v_lesson_state := 'completed';
    elsif exists (
      select 1
      from public.lesson_sessions session
      where session.user_id = auth.uid()
        and session.lesson_id = v_request.generated_lesson_id
        and session.status = 'active'
    ) then
      v_lesson_state := 'active';
    else
      v_lesson_state := 'ready';
    end if;
  end if;

  -- Resume is independent of today's entitlement date. The newest unfinished
  -- custom-topic assignment is resumable whether it is already active or only
  -- generated/assigned and not yet started.
  select
    request.id,
    assignment.lesson_id,
    coalesce(request.topic, lesson.topic),
    coalesce(request.jlpt_level::text, lesson.jlpt_level::text),
    case
      when exists (
        select 1
        from public.lesson_sessions session
        where session.user_id = auth.uid()
          and session.lesson_id = assignment.lesson_id
          and session.lesson_version_id = assignment.lesson_version_id
          and session.status = 'active'
      ) then 'active'
      else 'ready'
    end
  into
    v_resume_request_id,
    v_resume_lesson_id,
    v_resume_topic,
    v_resume_level,
    v_resume_lesson_state
  from public.lesson_assignments assignment
  join public.lessons lesson
    on lesson.id = assignment.lesson_id
  left join lateral (
    select candidate.*
    from public.custom_lesson_requests candidate
    where candidate.user_id = auth.uid()
      and candidate.generated_lesson_id = assignment.lesson_id
    order by candidate.created_at desc
    limit 1
  ) request on true
  where assignment.user_id = auth.uid()
    and assignment.selection_mode = 'custom_topic'
    and assignment.status in ('assigned','started')
    and not exists (
      select 1
      from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = assignment.lesson_id
        and completion.lesson_version_id = assignment.lesson_version_id
    )
  order by assignment.updated_at desc, assignment.assigned_at desc
  limit 1;

  return jsonb_build_object(
    'plan', case when v_profile.subscription_plan = 'free' then 'free' else 'premium' end,
    'local_date', v_local_date,
    'timezone', v_timezone,
    'quota_timezone', v_timezone,
    'can_create', v_can_create,
    'daily_limit', v_daily_limit,
    'creations_today', v_creations_today,

    -- Legacy/current-production aliases.
    'request_id', v_request.id,
    'request_status', case when v_request.id is null then null else v_request.status::text end,
    'topic', v_request.topic,
    'level', case when v_request.id is null then null else v_request.jlpt_level::text end,
    'lesson_id', v_request.generated_lesson_id,
    'lesson_state', v_lesson_state,
    'entitlement_consumed',
      case
        when v_profile.subscription_plan = 'free'
          then v_request.entitlement_consumed_at is not null
        else false
      end,

    -- Explicit product contract.
    'today_request_id', v_request.id,
    'today_request_status', case when v_request.id is null then null else v_request.status::text end,
    'today_topic', v_request.topic,
    'today_level', case when v_request.id is null then null else v_request.jlpt_level::text end,
    'today_lesson_id', v_request.generated_lesson_id,
    'today_lesson_state', v_lesson_state,
    'today_entitlement_consumed',
      case
        when v_profile.subscription_plan = 'free'
          then v_request.entitlement_consumed_at is not null
        else false
      end,
    'resume_request_id', v_resume_request_id,
    'resume_lesson_id', v_resume_lesson_id,
    'resume_topic', v_resume_topic,
    'resume_level', v_resume_level,
    'resume_lesson_state', v_resume_lesson_state
  );
end;
$$;

create or replace function public.learn_product_contract_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '20260820023100'::text
$$;

revoke all on function public.learn_product_contract_version()
  from public, anon;
grant execute on function public.learn_product_contract_version()
  to authenticated, service_role;

comment on function public.learn_product_contract_version() is
  'Activation sentinel for the Premium Translation and canonical /learn product contract.';

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.learn_product_contract_version()',
    'EXECUTE'
  ) then
    raise exception 'Learn product contract activation RPC is not executable by authenticated';
  end if;
end;
$$;
