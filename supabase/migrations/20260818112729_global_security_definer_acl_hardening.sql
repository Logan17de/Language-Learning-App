-- Fail closed for privileged public functions. New functions must opt in to
-- an execution role explicitly rather than inheriting PostgreSQL's broad
-- function EXECUTE defaults.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

-- Fix the NULL authorization bug in learner progress reset. Keep the original
-- self-or-admin contract, but reject unauthenticated callers explicitly and use
-- IS DISTINCT FROM so NULL can never bypass ownership checks.
create or replace function public.reset_learner_progress(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'Learner id is required' using errcode = '22023';
  end if;

  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;

    if auth.uid() is distinct from p_user_id
       and not coalesce(
         public.has_app_role(array['admin']::public.app_role[]),
         false
       ) then
      raise exception 'Permission denied' using errcode = '42501';
    end if;
  end if;

  delete from public.review_activity_answers where user_id = p_user_id;
  delete from public.review_results where user_id = p_user_id;
  delete from public.review_sessions where user_id = p_user_id;
  delete from public.review_queue where user_id = p_user_id;
  delete from public.lesson_events where user_id = p_user_id;
  delete from public.lesson_activity_answers where user_id = p_user_id;
  delete from public.lesson_completions where user_id = p_user_id;
  delete from public.lesson_sessions where user_id = p_user_id;
  delete from public.learner_mastery where user_id = p_user_id;
  delete from public.user_achievements where user_id = p_user_id;
  delete from public.weekly_activity where user_id = p_user_id;
  delete from public.reward_ledger where user_id = p_user_id;
  update public.profiles
  set xp = 0,
      streak_days = 0,
      longest_streak = 0,
      total_study_minutes = 0
  where id = p_user_id;

  insert into public.audit_logs (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_summary,
    metadata
  ) values (
    auth.uid(),
    'learner.progress_reset',
    'profile',
    p_user_id::text,
    jsonb_build_object('reset', true),
    '{}'::jsonb
  );

  return jsonb_build_object('user_id', p_user_id, 'reset', true);
end;
$$;

-- This routine is normally reached through the profile trigger. If it is ever
-- called directly, require service-role, the learner themself, or an admin.
-- pg_trigger_depth() keeps auth-signup/profile-trigger execution working while
-- still failing closed for direct PostgREST calls.
create or replace function public.sync_level_scoped_mastery_profile(
  p_user_id uuid,
  p_level public.jlpt_level
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or p_level is null then
    return;
  end if;

  if pg_trigger_depth() = 0
     and session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;

    if auth.uid() is distinct from p_user_id
       and not coalesce(
         public.has_app_role(array['admin']::public.app_role[]),
         false
       ) then
      raise exception 'Permission denied' using errcode = '42501';
    end if;
  end if;

  insert into public.learner_mastery (
    user_id,
    item_type,
    item_key,
    mastery,
    confidence,
    evidence_count,
    meaning_score,
    recognition_score,
    pronunciation_score,
    last_reviewed_at,
    next_review_at,
    created_at,
    updated_at
  )
  select
    p_user_id,
    'kanji',
    record.id::text,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    0,
    case when record.jlpt_level < p_level then 100 else 0 end,
    case when record.jlpt_level < p_level then 100 else 0 end,
    case when record.jlpt_level < p_level then 100 else 0 end,
    null,
    case when record.jlpt_level < p_level then now() + interval '7 days' else now() end,
    now(),
    now()
  from public.kanji_records record
  where record.jlpt_level <= p_level
    and record.archived_at is null
    and record.quality_status <> 'rejected'
  on conflict (user_id, item_type, item_key) do update
  set meaning_score = excluded.meaning_score,
      recognition_score = excluded.recognition_score,
      pronunciation_score = excluded.pronunciation_score,
      mastery = excluded.mastery,
      confidence = 0,
      next_review_at = excluded.next_review_at,
      updated_at = now()
  where public.learner_mastery.evidence_count = 0;

  insert into public.learner_mastery (
    user_id,
    item_type,
    item_key,
    mastery,
    confidence,
    evidence_count,
    meaning_score,
    recognition_score,
    pronunciation_score,
    last_reviewed_at,
    next_review_at,
    created_at,
    updated_at
  )
  select
    p_user_id,
    'grammar',
    record.id::text,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    0,
    0,
    case when record.jlpt_level < p_level then 100 else 0 end,
    0,
    null,
    case when record.jlpt_level < p_level then now() + interval '7 days' else now() end,
    now(),
    now()
  from public.grammar_records record
  where record.jlpt_level <= p_level
    and record.archived_at is null
    and record.quality_status <> 'rejected'
  on conflict (user_id, item_type, item_key) do update
  set meaning_score = 0,
      recognition_score = excluded.recognition_score,
      pronunciation_score = 0,
      mastery = excluded.mastery,
      confidence = 0,
      next_review_at = excluded.next_review_at,
      updated_at = now()
  where public.learner_mastery.evidence_count = 0;
end;
$$;

-- The scheduler functions need definer rights to read Vault/cron metadata, but
-- must never be callable by a normal PostgREST role. Cron connects as postgres;
-- the internal application diagnostics path uses a service-role client.
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
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
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
end;
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
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

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
end;
$$;

-- Start from a deny-by-default ACL for every current SECURITY DEFINER function
-- in the exposed public schema. The function owner (postgres) keeps its implicit
-- rights; external roles receive only the explicit grants below.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      fn.signature
    );
  end loop;
end
$$;

-- RLS helpers. Public policies that use these helpers are authenticated-only.
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(public.app_role[]) to authenticated;

-- Current learner/account RPCs.
grant execute on function public.assign_next_lesson() to authenticated;
grant execute on function public.complete_onboarding(text, text, public.jlpt_level, integer, text) to authenticated;
grant execute on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb) to authenticated;
grant execute on function public.get_learner_progress_summary() to authenticated;
grant execute on function public.record_mastery_evidence(uuid, jsonb) to authenticated;
grant execute on function public.reset_learner_progress(uuid) to authenticated;

-- Current authenticated admin/content RPCs. Their function bodies still perform
-- app-role checks; the ACL merely removes anonymous exposure.
grant execute on function public.publish_lesson_version(uuid, text) to authenticated;
grant execute on function public.save_lesson_draft(text, jsonb) to authenticated;
grant execute on function public.import_complete_lessons(jsonb, boolean) to authenticated;
grant execute on function public.create_lesson_tts_batch(integer, text) to authenticated;

-- Current server/worker RPCs. These are never browser-callable.
grant execute on function public.claim_custom_lesson_stage(uuid) to service_role;
grant execute on function public.claim_progressive_lesson_audio_job(uuid) to service_role;
grant execute on function public.claim_progressive_lesson_job(uuid) to service_role;
grant execute on function public.custom_lesson_scheduler_diagnostics() to service_role;
grant execute on function public.enrich_custom_lesson_placeholders_background(uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.invalidate_progressive_lesson_group(uuid, uuid, text, text) to service_role;
grant execute on function public.invoke_custom_lesson_worker() to service_role;
grant execute on function public.learn_grammar_pattern_alias(text, text, numeric) to service_role;
grant execute on function public.record_story_kanji_exposures_background(uuid, jsonb) to service_role;
grant execute on function public.reserve_lesson_generation_kanji_set(public.jlpt_level, text[], uuid, text) to service_role;
grant execute on function public.save_progressive_lesson_group(uuid, uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.store_generated_lesson_package_background(uuid, jsonb, integer) to service_role;
grant execute on function public.store_generated_lesson_package_background_base(uuid, jsonb, integer) to service_role;
grant execute on function public.store_generated_lesson_package_background_listening_base(uuid, jsonb, integer) to service_role;
grant execute on function public.store_generated_lesson_package_background_package_base(uuid, jsonb, integer) to service_role;
grant execute on function public.store_generated_lesson_package_background_reading_base(uuid, jsonb, integer) to service_role;
grant execute on function public.store_generated_lesson_package_background_reading_mcq_base(uuid, jsonb, integer) to service_role;
grant execute on function public.store_story_vocabulary_enrichment(uuid, public.jlpt_level, jsonb, text) to service_role;

-- TTS batching accepts an authenticated admin or service role in its body and
-- is used by internal/admin workflows, so preserve both intended callers.
grant execute on function public.create_lesson_tts_batch(integer, text) to service_role;

comment on function public.reset_learner_progress(uuid) is
  'Resets one learner progress account. Direct callers must be the learner, an authenticated admin, service role, or trusted postgres maintenance session; NULL auth cannot bypass ownership.';
comment on function public.sync_level_scoped_mastery_profile(uuid, public.jlpt_level) is
  'Synchronizes assumed mastery for a learner level. Trigger execution is trusted; direct calls fail closed unless trusted/self/admin/service-role.';
comment on function public.invoke_custom_lesson_worker() is
  'Cron/service-role-only scheduler entrypoint. Reads worker credentials from Vault and queues the internal authenticated worker request.';
