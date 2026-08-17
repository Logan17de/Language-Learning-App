-- Interests are no longer part of AIko's learner model. Lesson assignment is
-- level/mastery driven, while custom topics are supplied explicitly by learners.
-- Remove the remaining interest-specific assignment state and profile columns.

-- Retire the old RPC that returned profile interests to custom generation. The
-- current custom lesson flow writes requests directly and uses the durable job
-- runner instead.
drop function if exists public.begin_custom_lesson_generation(
  text,
  integer,
  text,
  text,
  text
);

-- Normalize historical standard assignments before tightening the mode enum-like
-- constraint. Pro custom assignments remain distinct because they represent a
-- different lesson origin, not personalization by interests.
update public.lesson_assignments
set selection_mode = 'standard',
    updated_at = now()
where selection_mode in ('free_random', 'pro_interest');

alter table public.lesson_assignments
  drop constraint if exists lesson_assignments_selection_mode_check;

alter table public.lesson_assignments
  add constraint lesson_assignments_selection_mode_check
  check (selection_mode in ('standard', 'pro_custom'));

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

  -- A never-started assignment can be returned again. Once a lesson has been
  -- started, abandoned, or completed it is consumed and never resurfaced.
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
    'level-v4-standard-no-resume'
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

-- No live function above depends on these fields now. Removing the columns also
-- prevents old clients from silently reintroducing interest personalization.
alter table public.lesson_assignments
  drop column if exists interest_matches;

alter table public.profiles
  drop column if exists interests;

alter table public.user_preferences
  drop column if exists interests;

comment on function public.assign_next_lesson() is
  'Returns only a never-started level-matched assignment or selects a new level-matched lesson. Learner interests are not collected or used.';
