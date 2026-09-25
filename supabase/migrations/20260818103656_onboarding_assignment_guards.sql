-- Onboarding owns the learner's initial profile commit. Keep that commit atomic,
-- prevent incomplete learners from receiving lessons, and ensure an unstarted
-- assignment can never remain sticky after the learner's level changes.

create or replace function public.complete_onboarding(
  p_display_name text,
  p_learning_goal text,
  p_level public.jlpt_level,
  p_daily_study_minutes integer,
  p_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_onboarding_complete boolean;
  v_goal text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_display_name), '') is null then
    raise exception 'Display name is required' using errcode = '22023';
  end if;

  if char_length(trim(p_display_name)) > 60 then
    raise exception 'Display name must be 60 characters or fewer' using errcode = '22023';
  end if;

  if p_level is null then
    raise exception 'Starting level is required' using errcode = '22023';
  end if;

  if p_daily_study_minutes not in (15, 30, 45, 60) then
    raise exception 'Daily study target must be 15, 30, 45, or 60 minutes' using errcode = '22023';
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

  select onboarding_complete into v_onboarding_complete
  from public.user_preferences
  where user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Learner preferences are unavailable' using errcode = '42501';
  end if;

  if v_onboarding_complete then
    raise exception 'Onboarding is already complete' using errcode = '42501';
  end if;

  v_goal := nullif(trim(coalesce(p_learning_goal, '')), '');

  update public.profiles
  set display_name = trim(p_display_name),
      current_jlpt_level = p_level,
      learning_goal = v_goal,
      daily_study_minutes = p_daily_study_minutes,
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      updated_at = now()
  where id = auth.uid();

  update public.user_preferences
  set learning_goal = v_goal,
      daily_study_minutes = p_daily_study_minutes,
      onboarding_complete = true,
      updated_at = now()
  where user_id = auth.uid();

  -- A never-started assignment is disposable. If a profile default or another
  -- client created one before the learner chose a level, remove it so the next
  -- assignment is selected against the committed onboarding level. Started,
  -- abandoned, and completed assignments remain historical evidence.
  delete from public.lesson_assignments assignment
  using public.lessons lesson
  where assignment.user_id = auth.uid()
    and assignment.status = 'assigned'
    and assignment.lesson_id = lesson.id
    and lesson.jlpt_level <> p_level;

  return jsonb_build_object(
    'display_name', trim(p_display_name),
    'learning_goal', v_goal,
    'level', p_level,
    'daily_study_minutes', p_daily_study_minutes,
    'onboarding_complete', true
  );
end
$$;

revoke all on function public.complete_onboarding(
  text,
  text,
  public.jlpt_level,
  integer,
  text
) from public;
grant execute on function public.complete_onboarding(
  text,
  text,
  public.jlpt_level,
  integer,
  text
) to authenticated;

create or replace function public.assign_next_lesson()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_existing public.lesson_assignments%rowtype;
  v_lesson public.lessons%rowtype;
  v_assignment public.lesson_assignments%rowtype;
  v_onboarding_complete boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
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

  select onboarding_complete into v_onboarding_complete
  from public.user_preferences
  where user_id = auth.uid()
  for update;

  if not found or not v_onboarding_complete then
    raise exception 'Complete onboarding before lesson assignment' using errcode = '42501';
  end if;

  -- Never reuse a pending assignment created for an older profile level.
  delete from public.lesson_assignments assignment
  using public.lessons lesson
  where assignment.user_id = auth.uid()
    and assignment.status = 'assigned'
    and assignment.lesson_id = lesson.id
    and lesson.jlpt_level <> v_profile.current_jlpt_level;

  select * into v_existing
  from public.lesson_assignments
  where user_id = auth.uid()
    and status = 'assigned'
  order by assigned_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'assignment_id', v_existing.id,
      'lesson_id', v_existing.lesson_id,
      'lesson_version_id', v_existing.lesson_version_id,
      'selection_mode', v_existing.selection_mode,
      'reused', true
    );
  end if;

  select l.* into v_lesson
  from public.lessons l
  where l.status = 'published'
    and l.archived_at is null
    and l.current_version_id is not null
    and l.jlpt_level = v_profile.current_jlpt_level
    and (l.generated_for_user_id is null or l.generated_for_user_id = auth.uid())
    and not exists (
      select 1
      from public.lesson_assignments a
      where a.user_id = auth.uid()
        and a.lesson_id = l.id
    )
    and not exists (
      select 1
      from public.lesson_completions c
      where c.user_id = auth.uid()
        and c.lesson_id = l.id
    )
  order by random()
  limit 1;

  if not found then
    return jsonb_build_object('assignment_id', null, 'reason', 'catalog_exhausted');
  end if;

  insert into public.lesson_assignments (
    user_id,
    lesson_id,
    lesson_version_id,
    selection_mode,
    algorithm_version
  ) values (
    auth.uid(),
    v_lesson.id,
    v_lesson.current_version_id,
    'standard',
    'level-v5-onboarding-guard'
  )
  returning * into v_assignment;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'lesson_id', v_assignment.lesson_id,
    'lesson_version_id', v_assignment.lesson_version_id,
    'selection_mode', v_assignment.selection_mode,
    'reused', false
  );
end
$$;

revoke all on function public.assign_next_lesson() from public;
grant execute on function public.assign_next_lesson() to authenticated;

comment on function public.complete_onboarding(text, text, public.jlpt_level, integer, text) is
  'Atomically commits the initial learner profile and preferences, marks onboarding complete, and removes any never-started assignment that no longer matches the selected level.';

comment on function public.assign_next_lesson() is
  'Requires completed onboarding, drops stale never-started level-mismatched assignments, then returns or creates an exact-level next lesson.';
