-- Learners may finish onboarding without interests.
-- Free learners always receive level-matched random lessons.
-- Pro learners receive interest-ranked lessons only after adding at least one non-blank interest.

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
  v_use_interests boolean;
  v_mode text;
  v_matches text[];
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select * into v_profile from public.profiles
    where id = auth.uid() and status = 'active' for update;
  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_use_interests := v_profile.subscription_plan <> 'free'
    and exists (
      select 1
      from unnest(coalesce(v_profile.interests, '{}'::text[])) as interest
      where nullif(trim(interest), '') is not null
    );

  select * into v_existing from public.lesson_assignments
    where user_id = auth.uid() and status in ('assigned', 'started')
    order by assigned_at desc limit 1;
  if found then
    return jsonb_build_object(
      'assignment_id', v_existing.id,
      'lesson_id', v_existing.lesson_id,
      'lesson_version_id', v_existing.lesson_version_id,
      'selection_mode', v_existing.selection_mode,
      'interest_matches', to_jsonb(v_existing.interest_matches),
      'reused', true
    );
  end if;

  select candidate.* into v_lesson
  from (
    select l.*,
      case when v_use_interests then (
        select count(*)::integer
        from unnest(coalesce(l.tags, '{}'::text[]) || array[l.topic]) as signal
        join unnest(coalesce(v_profile.interests, '{}'::text[])) as interest
          on lower(signal) like '%' || lower(interest) || '%'
          or lower(interest) like '%' || lower(signal) || '%'
      ) else 0 end as interest_score
    from public.lessons l
    where l.status = 'published'
      and l.archived_at is null
      and l.current_version_id is not null
      and l.jlpt_level = v_profile.current_jlpt_level
      and (l.generated_for_user_id is null or l.generated_for_user_id = auth.uid())
      and not exists (
        select 1 from public.lesson_assignments a
        where a.user_id = auth.uid() and a.lesson_id = l.id
      )
      and not exists (
        select 1 from public.lesson_completions c
        where c.user_id = auth.uid() and c.lesson_id = l.id
      )
  ) candidate
  order by
    case when v_use_interests then candidate.interest_score end desc nulls last,
    random()
  limit 1;

  if not found then
    return jsonb_build_object('assignment_id', null, 'reason', 'catalog_exhausted');
  end if;

  v_mode := case when v_use_interests then 'pro_interest' else 'free_random' end;
  if v_mode = 'pro_interest' then
    select coalesce(array_agg(distinct interest), '{}') into v_matches
    from unnest(coalesce(v_profile.interests, '{}'::text[])) as interest
    where nullif(trim(interest), '') is not null
      and exists (
        select 1
        from unnest(coalesce(v_lesson.tags, '{}'::text[]) || array[v_lesson.topic]) signal
        where lower(signal) like '%' || lower(interest) || '%'
          or lower(interest) like '%' || lower(signal) || '%'
      );
  else
    v_matches := '{}';
  end if;

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
    v_mode,
    'level-v2',
    v_matches
  ) returning * into v_assignment;

  return jsonb_build_object(
    'assignment_id', v_assignment.id,
    'lesson_id', v_assignment.lesson_id,
    'lesson_version_id', v_assignment.lesson_version_id,
    'selection_mode', v_assignment.selection_mode,
    'interest_matches', to_jsonb(v_assignment.interest_matches),
    'reused', false
  );
end
$$;

revoke all on function public.assign_next_lesson() from public;
grant execute on function public.assign_next_lesson() to authenticated;
