-- Return the complete learner-specific playable payload in one Data API call.
-- SECURITY INVOKER is intentional: the same RLS policies that protected the
-- former individual selects continue to decide whether each row is visible.

create or replace function public.get_playable_lesson_payload(
  p_lesson_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_lesson public.lessons%rowtype;
  v_version public.lesson_versions%rowtype;
  v_version_id uuid;
  v_plan text := 'free';
  v_role text := 'learner';
  v_premium boolean := false;
begin
  if v_user_id is null or p_lesson_id is null then
    return null;
  end if;

  select lesson.*
  into v_lesson
  from public.lessons lesson
  where lesson.id = p_lesson_id;

  if not found then
    return null;
  end if;

  select session.lesson_version_id
  into v_version_id
  from public.lesson_sessions session
  where session.user_id = v_user_id
    and session.lesson_id = v_lesson.id
    and session.status = 'active'
  order by session.started_at desc
  limit 1;

  v_version_id := coalesce(
    v_version_id,
    case when v_lesson.status = 'published' then v_lesson.current_version_id end
  );
  if v_version_id is null then
    return null;
  end if;

  select version.*
  into v_version
  from public.lesson_versions version
  where version.id = v_version_id
    and version.lesson_id = v_lesson.id;

  if not found then
    return null;
  end if;

  select profile.subscription_plan::text, profile.role::text
  into v_plan, v_role
  from public.profiles profile
  where profile.id = v_user_id;

  v_premium := coalesce(v_plan, 'free') <> 'free'
    or coalesce(v_role, 'learner') in ('admin', 'content_editor');

  return jsonb_build_object(
    'lesson', to_jsonb(v_lesson),
    'version', to_jsonb(v_version),
    'story', coalesce((
      select jsonb_agg(to_jsonb(line) order by line.position)
      from public.lesson_story_lines line
      where line.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'storyWords', coalesce((
      select jsonb_agg(to_jsonb(word) order by word.story_line_id, word.position)
      from public.lesson_story_words word
      where word.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'vocabulary', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_vocabulary item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'grammar', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_grammar item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'practice', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.phase, item.position)
      from public.lesson_practice_activities item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'reading', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_reading_sections item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'readingQuestions', coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_reading_questions item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb),
    'listening', case when v_premium then coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_listening_activities item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'speaking', case when v_premium then coalesce((
      select jsonb_agg(to_jsonb(item) order by item.position)
      from public.lesson_speaking_activities item
      where item.lesson_version_id = v_version_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'premiumPhaseAccess', case when v_premium then 'full' else 'locked' end,
    'knownKanji', coalesce((
      select jsonb_agg(progress.character order by progress.character)
      from public.learner_kanji_exposure_progress progress
      where progress.user_id = v_user_id
        and progress.appearance_count >= 10
    ), '[]'::jsonb)
  );
end
$$;

revoke all on function public.get_playable_lesson_payload(uuid)
  from public, anon;
grant execute on function public.get_playable_lesson_payload(uuid)
  to authenticated;

comment on function public.get_playable_lesson_payload(uuid) is
  'Loads one RLS-protected learner-specific lesson package without a browser-side query waterfall.';
