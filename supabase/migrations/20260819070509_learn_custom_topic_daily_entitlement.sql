alter table public.custom_lesson_requests
  add column if not exists entitlement_local_date date,
  add column if not exists entitlement_timezone text,
  add column if not exists uses_free_daily_entitlement boolean not null default false,
  add column if not exists entitlement_consumed_at timestamptz;

alter table public.lesson_assignments
  drop constraint if exists lesson_assignments_selection_mode_check;

alter table public.lesson_assignments
  add constraint lesson_assignments_selection_mode_check
  check (selection_mode in ('standard', 'pro_custom', 'custom_topic'));

create or replace function public.begin_custom_lesson_generation_v5(
  p_topic text,
  p_level public.jlpt_level
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing_request public.custom_lesson_requests%rowtype;
  v_request public.custom_lesson_requests%rowtype;
  v_job public.generated_lesson_jobs%rowtype;
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
  v_normalized_topic text;
  v_timezone text;
  v_local_date date;
  v_free boolean := false;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_topic, ''))) < 2 or length(p_topic) > 120 then
    raise exception 'Invalid custom lesson request' using errcode = '22023';
  end if;

  -- Serializes lesson creation per learner so simultaneous tabs cannot reserve
  -- more than one free daily lesson.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select name into v_timezone
  from pg_timezone_names
  where name = nullif(trim(v_profile.timezone), '')
  limit 1;
  v_timezone := coalesce(v_timezone, 'UTC');
  v_local_date := (now() at time zone v_timezone)::date;
  v_free := v_profile.subscription_plan = 'free';

  if v_free then
    select * into v_existing_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_local_date = v_local_date
      and (status <> 'failed' or entitlement_consumed_at is not null)
    order by created_at desc
    limit 1
    for update;

    if v_existing_request.id is not null then
      select * into v_job
      from public.generated_lesson_jobs
      where custom_lesson_request_id = v_existing_request.id
      order by created_at desc
      limit 1;

      if v_existing_request.generated_lesson_id is not null then
        select * into v_assignment
        from public.lesson_assignments
        where user_id = auth.uid()
          and lesson_id = v_existing_request.generated_lesson_id
        order by assigned_at desc
        limit 1;
      end if;

      return jsonb_build_object(
        'outcome', case when v_existing_request.generated_lesson_id is null then 'resume_request' else 'resume_lesson' end,
        'request_id', v_existing_request.id,
        'job_id', v_job.id,
        'level', v_existing_request.jlpt_level,
        'reused', false,
        'lesson_id', v_existing_request.generated_lesson_id,
        'lesson_version_id', v_assignment.lesson_version_id,
        'assignment_id', v_assignment.id,
        'free_daily_entitlement', true,
        'entitlement_consumed', v_existing_request.entitlement_consumed_at is not null
      );
    end if;
  else
    select count(*)::integer into v_count
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and entitlement_local_date = v_local_date
      and status <> 'failed';

    if v_count >= 5 then
      return jsonb_build_object(
        'outcome', 'limit',
        'code', 'PREMIUM_DAILY_LIMIT',
        'message', 'Premium daily lesson limit reached',
        'level', p_level
      );
    end if;
  end if;

  v_normalized_topic := public.normalize_lesson_topic(p_topic);

  -- Deliberately exact normalized-topic reuse only. Broad fuzzy reuse can
  -- violate the learner's explicit topic request.
  select candidate.* into v_lesson
  from public.lessons candidate
  where candidate.status = 'published'
    and candidate.archived_at is null
    and candidate.current_version_id is not null
    and candidate.reusable
    and candidate.jlpt_level = p_level
    and candidate.normalized_topic = v_normalized_topic
    and candidate.content_signature is not null
    and not exists (
      select 1
      from public.lesson_assignments assignment
      where assignment.user_id = auth.uid()
        and assignment.lesson_id = candidate.id
    )
    and not exists (
      select 1
      from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = candidate.id
    )
  order by candidate.usage_count asc, candidate.published_at desc nulls last
  limit 1;

  insert into public.custom_lesson_requests (
    user_id,
    topic,
    jlpt_level,
    duration_minutes,
    focus,
    speaking_difficulty,
    note,
    status,
    matched_lesson_id,
    generated_lesson_id,
    entitlement_local_date,
    entitlement_timezone,
    uses_free_daily_entitlement,
    entitlement_consumed_at
  ) values (
    auth.uid(),
    trim(p_topic),
    p_level,
    30,
    'balanced',
    'medium',
    '',
    (case when v_lesson.id is null then 'generation_pending' else 'approved' end)::public.custom_request_status,
    v_lesson.id,
    v_lesson.id,
    v_local_date,
    v_timezone,
    v_free,
    case when v_free and v_lesson.id is not null then now() else null end
  )
  returning * into v_request;

  if v_lesson.id is not null then
    insert into public.lesson_assignments (
      user_id,
      lesson_id,
      lesson_version_id,
      selection_mode,
      algorithm_version,
      interest_matches
    ) values (
      auth.uid(),
      v_lesson.id,
      v_lesson.current_version_id,
      'custom_topic',
      'custom-exact-reuse-v1',
      '{}'
    )
    returning * into v_assignment;

    update public.lessons
    set usage_count = usage_count + 1,
        last_assigned_at = now(),
        updated_at = now()
    where id = v_lesson.id;

    return jsonb_build_object(
      'outcome', 'published',
      'request_id', v_request.id,
      'job_id', null,
      'level', p_level,
      'reused', true,
      'lesson_id', v_lesson.id,
      'lesson_version_id', v_lesson.current_version_id,
      'assignment_id', v_assignment.id,
      'free_daily_entitlement', v_free,
      'entitlement_consumed', v_free
    );
  end if;

  insert into public.generated_lesson_jobs (
    custom_lesson_request_id,
    status,
    created_by
  ) values (
    v_request.id,
    'generating',
    auth.uid()
  )
  returning * into v_job;

  insert into public.progressive_lesson_drafts (
    request_id,
    job_id,
    user_id,
    topic,
    jlpt_level,
    story_draft,
    library_snapshot,
    status,
    current_stage,
    progress_percent,
    next_attempt_at
  ) values (
    v_request.id,
    v_job.id,
    v_request.user_id,
    v_request.topic,
    v_request.jlpt_level,
    null,
    null,
    'queued',
    'queued',
    0,
    now()
  ) on conflict (request_id) do nothing;

  return jsonb_build_object(
    'outcome', 'queued',
    'request_id', v_request.id,
    'job_id', v_job.id,
    'level', p_level,
    'reused', false,
    'lesson_id', null,
    'free_daily_entitlement', v_free,
    'entitlement_consumed', false
  );
end
$$;

revoke all on function public.begin_custom_lesson_generation_v5(text, public.jlpt_level) from public;
revoke all on function public.begin_custom_lesson_generation_v5(text, public.jlpt_level) from anon;
grant execute on function public.begin_custom_lesson_generation_v5(text, public.jlpt_level) to authenticated;
