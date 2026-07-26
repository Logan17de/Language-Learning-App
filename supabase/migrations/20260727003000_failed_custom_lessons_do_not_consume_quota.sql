-- Failed generation attempts are infrastructure failures, not delivered custom
-- lessons. Preserve them for audit history without consuming the learner's
-- daily allowance.

create or replace function public.begin_custom_lesson_generation_v2(
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
  v_request public.custom_lesson_requests%rowtype;
  v_job public.generated_lesson_jobs%rowtype;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and status = 'active';

  if not found or v_profile.subscription_plan = 'free' then
    raise exception 'Pro subscription required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_topic, ''))) < 2 or length(p_topic) > 120 then
    raise exception 'Invalid custom lesson request' using errcode = '22023';
  end if;
  if (
    select count(*)
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and created_at >= current_date
      and status <> 'failed'
  ) >= 5 then
    raise exception 'Daily custom lesson limit reached' using errcode = '54000';
  end if;

  insert into public.custom_lesson_requests (
    user_id,
    topic,
    jlpt_level,
    duration_minutes,
    focus,
    speaking_difficulty,
    note,
    status
  ) values (
    auth.uid(),
    trim(p_topic),
    p_level,
    30,
    'balanced',
    'medium',
    '',
    'generation_pending'
  )
  returning * into v_request;

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

  return jsonb_build_object(
    'request_id', v_request.id,
    'job_id', v_job.id,
    'level', p_level,
    'interests', to_jsonb(v_profile.interests)
  );
end
$$;

revoke all on function public.begin_custom_lesson_generation_v2(text, public.jlpt_level) from public;
grant execute on function public.begin_custom_lesson_generation_v2(text, public.jlpt_level) to authenticated;
