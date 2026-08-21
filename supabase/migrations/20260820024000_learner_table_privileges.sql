-- Learner table privileges for the /learn call graph.
--
-- Hosted Supabase grants broad table privileges to `authenticated` through
-- platform default privileges. A clean migration replay does not reproduce
-- those defaults, so a fresh database left `authenticated` without base
-- privileges on tables the browser and the RLS policies both depend on. The
-- protected-content policies illustrate the problem: reading
-- lesson_practice_activities, lesson_listening_activities and
-- lesson_speaking_activities evaluates EXISTS subqueries against
-- lesson_sessions, lesson_versions, lessons and profiles, so a learner without
-- SELECT on those tables received a hard "permission denied for table
-- lesson_sessions" instead of the intended RLS outcome.
--
-- This migration makes the learner privilege surface explicit and minimal
-- instead of inherited. Row visibility and the Free/Premium boundary stay
-- entirely in RLS; table privileges only decide whether RLS gets to run.
--
-- Deliberately NOT granted:
--   * lesson_translation_questions - model_answer stays server-owned and is
--     reached only through trusted server routes.
--   * DELETE / TRUNCATE anywhere - progress reset runs through the
--     SECURITY DEFINER reset_learner_progress() function.
--   * learner_mastery / learner_mastery_events writes - the canonical mastery
--     boundary is commit_lesson_phase(), locked down in 20260820021500.

-- ---------------------------------------------------------------------------
-- Published and session-scoped lesson content. RLS decides which rows are
-- visible, including the Premium gate on Listening and Speaking.
-- ---------------------------------------------------------------------------
grant select on
  public.lessons,
  public.lesson_versions,
  public.lesson_story_lines,
  public.lesson_story_words,
  public.lesson_vocabulary,
  public.lesson_grammar,
  public.lesson_practice_activities,
  public.lesson_reading_sections,
  public.lesson_reading_questions,
  public.lesson_listening_activities,
  public.lesson_speaking_activities,
  public.audio_assets,
  public.image_assets
to authenticated;

-- ---------------------------------------------------------------------------
-- Learner-owned state the browser reads back. RLS restricts every one of
-- these to the learner's own rows.
-- ---------------------------------------------------------------------------
grant select on
  public.lesson_assignments,
  public.lesson_completions,
  public.learner_kanji_exposure_progress,
  public.learner_story_kanji_exposures,
  public.custom_lesson_requests
to authenticated;

-- ---------------------------------------------------------------------------
-- Reference data used by the progress surfaces.
-- ---------------------------------------------------------------------------
grant select on
  public.vocabulary_records,
  public.kanji_records,
  public.grammar_records,
  public.achievements,
  public.user_achievements,
  public.weekly_activity
to authenticated;

-- ---------------------------------------------------------------------------
-- Account records the learner reads, and the preference rows they may edit.
-- ---------------------------------------------------------------------------
grant select on public.user_subscriptions to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- The learner write path. lesson_sessions is inserted and updated directly;
-- answers and events are upserted. No DELETE is required anywhere: progress
-- reset is a SECURITY DEFINER operation.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.lesson_sessions to authenticated;
grant select, insert, update on public.lesson_activity_answers to authenticated;
grant select, insert, update on public.lesson_events to authenticated;

revoke delete, truncate on public.lesson_sessions from authenticated;
revoke delete, truncate on public.lesson_activity_answers from authenticated;
revoke delete, truncate on public.lesson_events from authenticated;
revoke delete, truncate on public.lesson_assignments from authenticated;
revoke delete, truncate on public.lesson_completions from authenticated;
revoke insert, update, delete, truncate on public.lesson_assignments from authenticated;
revoke insert, update, delete, truncate on public.lesson_completions from authenticated;

-- ---------------------------------------------------------------------------
-- Server-owned Translation targets stay unreachable from the browser role.
-- ---------------------------------------------------------------------------
revoke all on public.lesson_translation_questions from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Restate the mastery boundary so it cannot drift back open.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.learner_mastery from authenticated;
revoke insert, update, delete, truncate on public.learner_mastery_events from authenticated;
grant select on public.learner_mastery to authenticated;
grant select on public.learner_mastery_events to authenticated;

-- ---------------------------------------------------------------------------
-- Fail the migration if any boundary above did not take effect. Every check
-- uses has_table_privilege(), which is safe on any relation kind.
-- ---------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_write_tables constant text[] := array[
    'lesson_sessions', 'lesson_activity_answers', 'lesson_events'
  ];
  v_read_tables constant text[] := array[
    'lessons', 'lesson_versions', 'lesson_practice_activities',
    'lesson_reading_sections', 'lesson_reading_questions',
    'lesson_listening_activities', 'lesson_speaking_activities',
    'lesson_assignments', 'lesson_completions'
  ];
begin
  foreach v_table in array v_write_tables loop
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       or not has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE') then
      raise exception 'authenticated is missing required privileges on public.%', v_table;
    end if;
    if has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'authenticated must not delete or truncate public.%', v_table;
    end if;
  end loop;

  foreach v_table in array v_read_tables loop
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then
      raise exception 'authenticated is missing SELECT on public.%', v_table;
    end if;
  end loop;

  if has_table_privilege('authenticated', 'public.lesson_translation_questions', 'SELECT') then
    raise exception 'Translation model answers must stay server-owned';
  end if;

  foreach v_table in array array['learner_mastery', 'learner_mastery_events'] loop
    if has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'DELETE')
       or has_table_privilege('authenticated', 'public.' || v_table, 'TRUNCATE') then
      raise exception 'learner mastery ledger must not be writable by authenticated: %', v_table;
    end if;
    if not has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') then
      raise exception 'learner must be able to read own mastery: %', v_table;
    end if;
  end loop;
end
$$;
