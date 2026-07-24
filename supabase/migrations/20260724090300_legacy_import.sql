create or replace function public.import_legacy_progress(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_lesson public.lessons%rowtype;
  v_session_id uuid;
  v_imported_lessons integer := 0;
  v_imported_mastery integer := 0;
  v_imported_queue integer := 0;
  v_imported_achievements integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if exists (select 1 from public.profiles where id = v_user_id and legacy_imported_at is not null) then
    return jsonb_build_object('already_imported', true, 'lessons', 0, 'mastery', 0, 'queue', 0, 'achievements', 0);
  end if;

  insert into public.user_preferences
    (user_id, learning_goal, daily_study_minutes, interests, onboarding_complete)
  values
    (v_user_id, nullif(p_payload #>> '{preferences,learning_goal}', ''),
     case coalesce((p_payload #>> '{preferences,daily_study_minutes}')::integer, 30)
       when 15 then 15 when 45 then 45 when 60 then 60 else 30 end,
     coalesce(array(select jsonb_array_elements_text(p_payload #> '{preferences,interests}')), '{}'),
     coalesce((p_payload #>> '{preferences,onboarding_complete}')::boolean, false))
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id, settings)
  values (v_user_id, coalesce(p_payload->'settings', '{}'::jsonb))
  on conflict (user_id) do nothing;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'completed_lessons', '[]'::jsonb))
  loop
    select * into v_lesson from public.lessons
      where legacy_id = v_item->>'lesson_id' and current_version_id is not null limit 1;
    if found and not exists (
      select 1 from public.lesson_completions
      where user_id = v_user_id and completion_data->>'legacy_key' = v_item->>'legacy_key'
    ) then
      insert into public.lesson_sessions
        (user_id, lesson_id, lesson_version_id, status, current_phase, current_phase_index,
         activity_index, elapsed_seconds, checkpoint, started_at, completed_at, last_saved_at)
      values
        (v_user_id, v_lesson.id, v_lesson.current_version_id, 'completed', 'review', 6, 0,
         greatest(0, coalesce((v_item->>'duration_minutes')::integer, 0) * 60),
         jsonb_build_object('legacy_import', true),
         coalesce((v_item->>'completed_at')::timestamptz, now()),
         coalesce((v_item->>'completed_at')::timestamptz, now()), now())
      returning id into v_session_id;

      insert into public.lesson_completions
        (user_id, lesson_id, lesson_version_id, lesson_session_id, score, xp_awarded,
         duration_minutes, completion_data, completed_at)
      values
        (v_user_id, v_lesson.id, v_lesson.current_version_id, v_session_id,
         greatest(0, least(100, coalesce((v_item->>'score')::integer, 0))), 0,
         greatest(0, least(1440, coalesce((v_item->>'duration_minutes')::integer, 0))),
         jsonb_build_object('legacy_import', true, 'legacy_key', v_item->>'legacy_key'),
         coalesce((v_item->>'completed_at')::timestamptz, now()));
      v_imported_lessons := v_imported_lessons + 1;
    end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'mastery', '[]'::jsonb))
  loop
    insert into public.learner_mastery
      (user_id, item_type, item_key, mastery, confidence, evidence_count)
    values
      (v_user_id, v_item->>'item_type', v_item->>'item_key',
       greatest(0, least(100, coalesce((v_item->>'mastery')::integer, 0))),
       greatest(0, least(100, coalesce((v_item->>'confidence')::integer, 0))), 1)
    on conflict (user_id, item_type, item_key) do nothing;
    if found then v_imported_mastery := v_imported_mastery + 1; end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'review_queue', '[]'::jsonb))
  loop
    insert into public.review_queue
      (user_id, item_type, item_key, prompt_data, due_at, confidence, reason, status)
    values
      (v_user_id, v_item->>'item_type', v_item->>'item_key',
       coalesce(v_item->'prompt_data', '{}'::jsonb),
       coalesce((v_item->>'due_at')::timestamptz, now()),
       greatest(0, least(100, coalesce((v_item->>'confidence')::integer, 0))),
       coalesce(v_item->>'reason', 'Imported from this device'), 'due')
    on conflict (user_id, item_type, item_key) do nothing;
    if found then v_imported_queue := v_imported_queue + 1; end if;
  end loop;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload->'achievements', '[]'::jsonb))
  loop
    insert into public.user_achievements (user_id, achievement_id, progress, earned_at)
    select v_user_id, a.id, greatest(0, coalesce((v_item->>'progress')::integer, 0)),
      case when coalesce((v_item->>'earned')::boolean, false)
        then coalesce((v_item->>'earned_at')::timestamptz, now()) else null end
    from public.achievements a where a.key = v_item->>'key'
    on conflict (user_id, achievement_id) do nothing;
    if found then v_imported_achievements := v_imported_achievements + 1; end if;
  end loop;

  update public.profiles set legacy_imported_at = now() where id = v_user_id;
  return jsonb_build_object(
    'already_imported', false,
    'lessons', v_imported_lessons,
    'mastery', v_imported_mastery,
    'queue', v_imported_queue,
    'achievements', v_imported_achievements
  );
end
$$;

revoke all on function public.import_legacy_progress(jsonb) from public;
grant execute on function public.import_legacy_progress(jsonb) to authenticated;
