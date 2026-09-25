create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.custom_lesson_scheduler_diagnostics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_name constant text := 'custom-lesson-worker-every-minute';
  v_worker_url text;
  v_worker_secret text;
  v_job_id bigint;
  v_job_schedule text;
  v_job_active boolean := false;
  v_url_configured boolean := false;
  v_secret_configured boolean := false;
  v_ready boolean := false;
  v_last_run_status text;
  v_last_run_finished_at timestamptz;
  v_detail text;
begin
  select btrim(decrypted_secret)
  into v_worker_url
  from vault.decrypted_secrets
  where name = 'custom_lesson_worker_url'
  order by updated_at desc
  limit 1;

  select btrim(decrypted_secret)
  into v_worker_secret
  from vault.decrypted_secrets
  where name = 'custom_lesson_worker_secret'
  order by updated_at desc
  limit 1;

  select jobid, schedule, active
  into v_job_id, v_job_schedule, v_job_active
  from cron.job
  where jobname = v_job_name
  order by jobid desc
  limit 1;

  if v_job_id is not null then
    select status, end_time
    into v_last_run_status, v_last_run_finished_at
    from cron.job_run_details
    where jobid = v_job_id
    order by runid desc
    limit 1;
  end if;

  v_url_configured := coalesce(
    btrim(v_worker_url) ~ '^https://[^[:space:]]+/api/internal/custom-lessons/process$',
    false
  );
  v_secret_configured := coalesce(length(btrim(v_worker_secret)) >= 16, false);
  v_ready := v_url_configured
    and v_secret_configured
    and coalesce(v_job_active, false)
    and v_job_schedule = '* * * * *';

  v_detail := case
    when v_ready then 'Supabase cron is active and its Vault URL and bearer secret are configured.'
    else concat_ws(
      ' ',
      case when not v_url_configured
        then 'Vault secret custom_lesson_worker_url must be the full HTTPS worker endpoint.' end,
      case when not v_secret_configured
        then 'Vault secret custom_lesson_worker_secret must contain at least 16 characters.' end,
      case when not coalesce(v_job_active, false) or v_job_schedule is distinct from '* * * * *'
        then 'Cron job custom-lesson-worker-every-minute is not active on the every-minute schedule.' end
    )
  end;

  insert into public.service_status (service_name, status, detail)
  values (
    'Custom lesson scheduler',
    case when v_ready then 'operational' else 'degraded' end,
    v_detail
  )
  on conflict (service_name) do update
  set status = excluded.status,
      detail = excluded.detail,
      updated_at = now();

  return jsonb_build_object(
    'ready', v_ready,
    'job_name', v_job_name,
    'job_active', coalesce(v_job_active, false),
    'schedule', v_job_schedule,
    'worker_url_configured', v_url_configured,
    'worker_secret_configured', v_secret_configured,
    'last_run_status', v_last_run_status,
    'last_run_finished_at', v_last_run_finished_at,
    'detail', v_detail,
    'checked_at', now()
  );
end
$$;

create or replace function public.invoke_custom_lesson_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_diagnostics jsonb;
  v_worker_url text;
  v_worker_secret text;
  v_request_id bigint;
begin
  v_diagnostics := public.custom_lesson_scheduler_diagnostics();
  if not coalesce((v_diagnostics->>'ready')::boolean, false) then
    raise warning 'Custom lesson worker invocation skipped: %', v_diagnostics->>'detail';
    return null;
  end if;

  select btrim(decrypted_secret)
  into v_worker_url
  from vault.decrypted_secrets
  where name = 'custom_lesson_worker_url'
  order by updated_at desc
  limit 1;

  select btrim(decrypted_secret)
  into v_worker_secret
  from vault.decrypted_secrets
  where name = 'custom_lesson_worker_secret'
  order by updated_at desc
  limit 1;

  select net.http_post(
    url := v_worker_url,
    body := jsonb_build_object('source', 'supabase_pg_cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_secret
    ),
    timeout_milliseconds := 285000
  )
  into v_request_id;

  update public.service_status
  set status = 'operational',
      detail = format('Supabase cron queued worker request %s.', v_request_id),
      updated_at = now()
  where service_name = 'Custom lesson scheduler';

  return v_request_id;
end
$$;

revoke all on function public.custom_lesson_scheduler_diagnostics() from public;
revoke all on function public.invoke_custom_lesson_worker() from public;
grant execute on function public.custom_lesson_scheduler_diagnostics() to service_role;

do $$
declare
  v_existing_job_id bigint;
begin
  for v_existing_job_id in
    select jobid
    from cron.job
    where jobname = 'custom-lesson-worker-every-minute'
  loop
    perform cron.unschedule(v_existing_job_id);
  end loop;

  perform cron.schedule(
    'custom-lesson-worker-every-minute',
    '* * * * *',
    'select public.invoke_custom_lesson_worker();'
  );
end
$$;

select public.custom_lesson_scheduler_diagnostics();

comment on function public.custom_lesson_scheduler_diagnostics() is
  'Reports scheduler, Vault, and latest-run readiness without returning secret values.';
comment on function public.invoke_custom_lesson_worker() is
  'Queues one authenticated asynchronous worker request through pg_net.';
