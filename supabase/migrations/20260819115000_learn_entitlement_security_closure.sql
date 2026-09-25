-- Close the remaining learner entitlement bypasses around profile authority,
-- daily lesson quotas, legacy assignment creation, and Premium phase data.

-- Learners may edit only genuine profile preferences. Privileged account and
-- reward fields remain server-owned.
revoke insert, delete, truncate, references, trigger, update on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, current_jlpt_level, learning_goal, daily_study_minutes, timezone)
  on public.profiles to authenticated;

-- Normalize historical entitlement timezones before freezing the daily reset
-- boundary to each learner's first custom-lesson request.
update public.custom_lesson_requests request
set entitlement_timezone = coalesce(
  (
    select tz.name
    from pg_timezone_names tz
    join public.profiles profile on profile.id = request.user_id
    where tz.name = nullif(trim(profile.timezone), '')
    limit 1
  ),
  'UTC'
)
where request.entitlement_timezone is null
   or not exists (
     select 1 from pg_timezone_names tz where tz.name = request.entitlement_timezone
   );

update public.custom_lesson_requests
set entitlement_local_date = (created_at at time zone entitlement_timezone)::date
where entitlement_local_date is null;

create or replace function public.lesson_quota_timezone(
  p_user_id uuid,
  p_profile_timezone text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_timezone text;
begin
  select request.entitlement_timezone
  into v_timezone
  from public.custom_lesson_requests request
  join pg_timezone_names tz on tz.name = request.entitlement_timezone
  where request.user_id = p_user_id
  order by request.created_at asc
  limit 1;

  if v_timezone is not null then
    return v_timezone;
  end if;

  select tz.name
  into v_timezone
  from pg_timezone_names tz
  where tz.name = nullif(trim(p_profile_timezone), '')
  limit 1;

  return coalesce(v_timezone, 'UTC');
end;
$$;
revoke all on function public.lesson_quota_timezone(uuid, text) from public, anon, authenticated;

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

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_timezone := public.lesson_quota_timezone(auth.uid(), v_profile.timezone);
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
          and selection_mode = 'custom_topic'
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

  select candidate.* into v_lesson
  from public.lessons candidate
  where candidate.status = 'published'
    and candidate.archived_at is null
    and candidate.current_version_id is not null
    and candidate.reusable
    and candidate.jlpt_level = p_level
    and candidate.normalized_topic = v_normalized_topic
    and candidate.content_signature is not null
    and (candidate.generated_for_user_id is null or candidate.generated_for_user_id = auth.uid())
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
    user_id, topic, jlpt_level, duration_minutes, focus, speaking_difficulty,
    note, status, matched_lesson_id, generated_lesson_id,
    entitlement_local_date, entitlement_timezone,
    uses_free_daily_entitlement, entitlement_consumed_at
  ) values (
    auth.uid(), trim(p_topic), p_level, 30, 'balanced', 'medium', '',
    (case when v_lesson.id is null then 'generation_pending' else 'approved' end)::public.custom_request_status,
    v_lesson.id, v_lesson.id, v_local_date, v_timezone, v_free,
    case when v_free and v_lesson.id is not null then now() else null end
  )
  returning * into v_request;

  if v_lesson.id is not null then
    insert into public.lesson_assignments (
      user_id, lesson_id, lesson_version_id, selection_mode,
      algorithm_version, interest_matches
    ) values (
      auth.uid(), v_lesson.id, v_lesson.current_version_id,
      'custom_topic', 'custom-exact-reuse-v2', '{}'
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
    custom_lesson_request_id, status, created_by
  ) values (
    v_request.id, 'generating', auth.uid()
  )
  returning * into v_job;

  insert into public.progressive_lesson_drafts (
    request_id, job_id, user_id, topic, jlpt_level,
    story_draft, library_snapshot, status, current_stage,
    progress_percent, next_attempt_at
  ) values (
    v_request.id, v_job.id, v_request.user_id, v_request.topic,
    v_request.jlpt_level, null, null, 'queued', 'queued', 0, now()
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
end;
$$;

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
  v_lesson_state text := null;
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
    select * into v_request
    from public.custom_lesson_requests
    where user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_local_date = v_local_date
      and (status <> 'failed' or entitlement_consumed_at is not null)
    order by created_at desc
    limit 1;
  else
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
  end if;

  if v_request.id is not null then
    if v_request.generated_lesson_id is null then
      if v_request.status <> 'failed' then
        v_lesson_state := 'building';
      end if;
    elsif exists (
      select 1 from public.lesson_completions completion
      where completion.user_id = auth.uid()
        and completion.lesson_id = v_request.generated_lesson_id
    ) then
      v_lesson_state := 'completed';
    elsif exists (
      select 1 from public.lesson_sessions session
      where session.user_id = auth.uid()
        and session.lesson_id = v_request.generated_lesson_id
        and session.status = 'active'
    ) then
      v_lesson_state := 'active';
    else
      v_lesson_state := 'ready';
    end if;
  end if;

  if v_profile.subscription_plan = 'free' then
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
      'lesson_state', v_lesson_state,
      'entitlement_consumed', v_request.entitlement_consumed_at is not null
    );
  end if;

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
    'lesson_state', v_lesson_state,
    'entitlement_consumed', false
  );
end;
$$;

-- Story is the first usable progressive lesson content. Free learners must get
-- an explicit persisted consumption acknowledgement before it is returned.
create or replace function public.consume_custom_lesson_story_entitlement(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_request public.custom_lesson_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and status = 'active';
  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  select * into v_request
  from public.custom_lesson_requests
  where id = p_request_id
    and user_id = auth.uid()
  for update;
  if not found then
    return false;
  end if;

  if v_profile.subscription_plan <> 'free' then
    return true;
  end if;

  if not v_request.uses_free_daily_entitlement then
    return false;
  end if;

  if v_request.entitlement_consumed_at is null then
    update public.custom_lesson_requests
    set entitlement_consumed_at = now(),
        updated_at = now()
    where id = v_request.id
      and user_id = auth.uid()
      and uses_free_daily_entitlement
      and entitlement_consumed_at is null
    returning * into v_request;
  end if;

  return v_request.id = p_request_id
    and v_request.uses_free_daily_entitlement
    and v_request.entitlement_consumed_at is not null;
end;
$$;
revoke all on function public.consume_custom_lesson_story_entitlement(uuid) from public, anon;
grant execute on function public.consume_custom_lesson_story_entitlement(uuid) to authenticated;

-- Retire the predefined assignment path, but normalize historical custom lessons
-- so valid generated work remains resumable.
update public.lesson_assignments
set selection_mode = 'custom_topic', updated_at = now()
where selection_mode = 'pro_custom'
  and coalesce(algorithm_version, '') like 'custom-%';

update public.lesson_sessions session
set status = 'abandoned',
    last_saved_at = now(),
    updated_at = now()
where session.status = 'active'
  and exists (
    select 1
    from public.lesson_assignments assignment
    where assignment.user_id = session.user_id
      and assignment.lesson_id = session.lesson_id
      and assignment.lesson_version_id = session.lesson_version_id
      and assignment.selection_mode = 'standard'
      and assignment.status in ('assigned', 'started')
  );

update public.lesson_assignments
set status = 'abandoned', updated_at = now()
where selection_mode = 'standard'
  and status in ('assigned', 'started');

revoke all on function public.assign_next_lesson() from public, anon, authenticated;

drop policy if exists lesson_sessions_requires_assignment on public.lesson_sessions;
create policy lesson_sessions_requires_assignment
on public.lesson_sessions
as restrictive
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.lesson_assignments assignment
    where assignment.user_id = auth.uid()
      and assignment.lesson_id = lesson_sessions.lesson_id
      and assignment.lesson_version_id = lesson_sessions.lesson_version_id
      and assignment.status in ('assigned', 'started')
      and assignment.selection_mode = 'custom_topic'
  )
);

-- Listening and Speaking are Premium data, not merely Premium UI.
drop policy if exists lesson_listening_activities_public_read on public.lesson_listening_activities;
drop policy if exists lesson_listening_activities_active_session_read on public.lesson_listening_activities;
drop policy if exists lesson_listening_activities_generated_owner_read on public.lesson_listening_activities;
drop policy if exists lesson_listening_activities_premium_read on public.lesson_listening_activities;
create policy lesson_listening_activities_premium_read
on public.lesson_listening_activities
for select
to authenticated
using (
  exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.subscription_plan <> 'free'
  )
  and (
    exists (
      select 1 from public.lessons lesson
      where lesson.current_version_id = lesson_listening_activities.lesson_version_id
        and lesson.archived_at is null
        and (lesson.generated_for_user_id is null or lesson.generated_for_user_id = auth.uid())
    )
    or exists (
      select 1
      from public.lesson_sessions session
      join public.lesson_versions version
        on version.id = session.lesson_version_id
       and version.lesson_id = session.lesson_id
      join public.lessons lesson on lesson.id = session.lesson_id
      where session.user_id = auth.uid()
        and session.lesson_version_id = lesson_listening_activities.lesson_version_id
        and (lesson.generated_for_user_id is null or lesson.generated_for_user_id = auth.uid())
    )
  )
);

drop policy if exists lesson_speaking_activities_public_read on public.lesson_speaking_activities;
drop policy if exists lesson_speaking_activities_active_session_read on public.lesson_speaking_activities;
drop policy if exists lesson_speaking_activities_generated_owner_read on public.lesson_speaking_activities;
drop policy if exists lesson_speaking_activities_premium_read on public.lesson_speaking_activities;
create policy lesson_speaking_activities_premium_read
on public.lesson_speaking_activities
for select
to authenticated
using (
  exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.subscription_plan <> 'free'
  )
  and (
    exists (
      select 1 from public.lessons lesson
      where lesson.current_version_id = lesson_speaking_activities.lesson_version_id
        and lesson.archived_at is null
        and (lesson.generated_for_user_id is null or lesson.generated_for_user_id = auth.uid())
    )
    or exists (
      select 1
      from public.lesson_sessions session
      join public.lesson_versions version
        on version.id = session.lesson_version_id
       and version.lesson_id = session.lesson_id
      join public.lessons lesson on lesson.id = session.lesson_id
      where session.user_id = auth.uid()
        and session.lesson_version_id = lesson_speaking_activities.lesson_version_id
        and (lesson.generated_for_user_id is null or lesson.generated_for_user_id = auth.uid())
    )
  )
);

revoke select on public.lesson_listening_activities, public.lesson_speaking_activities from anon;

drop policy if exists audio_assets_authenticated_read on public.audio_assets;
drop policy if exists audio_assets_premium_read on public.audio_assets;
create policy audio_assets_premium_read
on public.audio_assets
for select
to authenticated
using (
  archived_at is null
  and status = 'active'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.subscription_plan <> 'free'
  )
);
revoke select on public.audio_assets from anon;

drop policy if exists lesson_audio_authenticated_read on storage.objects;
drop policy if exists lesson_audio_premium_read on storage.objects;
create policy lesson_audio_premium_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-audio'
  and exists (
    select 1 from public.profiles profile
    where profile.id = auth.uid()
      and profile.status = 'active'
      and profile.subscription_plan <> 'free'
  )
);

-- Learners can persist only unprotected answer phases directly. Speaking and
-- grammar-translation evaluations are written by trusted server routes.
drop policy if exists lesson_activity_answers_own_insert on public.lesson_activity_answers;
drop policy if exists lesson_activity_answers_own_update on public.lesson_activity_answers;
create policy lesson_activity_answers_own_insert
on public.lesson_activity_answers
for insert
to authenticated
with check (
  user_id = auth.uid()
  and phase in ('vocabulary', 'grammar', 'reading', 'listening')
  and exists (
    select 1 from public.lesson_sessions session
    where session.id = lesson_activity_answers.lesson_session_id
      and session.user_id = auth.uid()
      and session.status = 'active'
  )
  and (
    phase <> 'listening'
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.status = 'active'
        and profile.subscription_plan <> 'free'
    )
  )
);
create policy lesson_activity_answers_own_update
on public.lesson_activity_answers
for update
to authenticated
using (
  user_id = auth.uid()
  and phase in ('vocabulary', 'grammar', 'reading', 'listening')
)
with check (
  user_id = auth.uid()
  and phase in ('vocabulary', 'grammar', 'reading', 'listening')
  and exists (
    select 1 from public.lesson_sessions session
    where session.id = lesson_activity_answers.lesson_session_id
      and session.user_id = auth.uid()
      and session.status = 'active'
  )
  and (
    phase <> 'listening'
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.status = 'active'
        and profile.subscription_plan <> 'free'
    )
  )
);

drop policy if exists lesson_events_own_insert on public.lesson_events;
drop policy if exists lesson_events_own_update on public.lesson_events;
create policy lesson_events_own_insert
on public.lesson_events
for insert
to authenticated
with check (
  user_id = auth.uid()
  and phase in ('story', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking')
  and exists (
    select 1 from public.lesson_sessions session
    where session.id = lesson_events.lesson_session_id
      and session.user_id = auth.uid()
      and session.status = 'active'
  )
  and (
    phase not in ('listening', 'speaking')
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.status = 'active'
        and profile.subscription_plan <> 'free'
    )
  )
);
create policy lesson_events_own_update
on public.lesson_events
for update
to authenticated
using (
  user_id = auth.uid()
  and phase in ('story', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking')
)
with check (
  user_id = auth.uid()
  and phase in ('story', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking')
  and exists (
    select 1 from public.lesson_sessions session
    where session.id = lesson_events.lesson_session_id
      and session.user_id = auth.uid()
      and session.status = 'active'
  )
  and (
    phase not in ('listening', 'speaking')
    or exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.status = 'active'
        and profile.subscription_plan <> 'free'
    )
  )
);
