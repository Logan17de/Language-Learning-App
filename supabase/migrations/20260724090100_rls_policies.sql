create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and status = 'active'
$$;

create or replace function public.has_app_role(allowed public.app_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any(allowed), false)
$$;

revoke all on function public.has_app_role(public.app_role[]) from public;
revoke all on function public.current_app_role() from public;
grant execute on function public.has_app_role(public.app_role[]) to authenticated;
grant execute on function public.current_app_role() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles','user_preferences','user_settings','user_subscriptions','curriculum_levels','curriculum_items',
    'grammar_records','kanji_records','vocabulary_records','lessons','lesson_versions','lesson_story_lines',
    'lesson_vocabulary','lesson_grammar','lesson_reading_sections','lesson_listening_activities',
    'lesson_speaking_activities','lesson_review_activities','lesson_assets','image_assets','audio_assets',
    'lesson_sessions','lesson_activity_answers','lesson_events','lesson_completions','learner_mastery',
    'review_queue','review_sessions','review_activity_answers','review_results','achievements',
    'user_achievements','weekly_activity','custom_lesson_requests','generated_lesson_jobs',
    'lesson_validation_runs','lesson_validation_checks','lesson_reports','support_tickets',
    'support_messages','audit_logs','feature_flags','service_status','cost_records','reward_ledger'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() and status = 'active')
  with check (id = auth.uid() and role = public.current_app_role() and status = 'active');
create policy profiles_staff_read on public.profiles for select to authenticated
  using (public.has_app_role(array['admin','support']::public.app_role[]));
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]))
  with check (public.has_app_role(array['admin']::public.app_role[]));

create policy preferences_own_all on public.user_preferences for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_own_all on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy subscriptions_own_read on public.user_subscriptions for select to authenticated using (user_id = auth.uid());
create policy subscriptions_admin_all on public.user_subscriptions for all to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]))
  with check (public.has_app_role(array['admin']::public.app_role[]));

create policy lessons_published_read on public.lessons for select to anon, authenticated
  using (status = 'published' and archived_at is null);
create policy lessons_active_session_read on public.lessons for select to authenticated
  using (exists (
    select 1 from public.lesson_sessions s
    where s.lesson_id = lessons.id and s.user_id = auth.uid() and s.status = 'active'
  ));
create policy lessons_content_staff_all on public.lessons for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

create policy versions_published_read on public.lesson_versions for select to anon, authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'published' and l.current_version_id = lesson_versions.id));
create policy versions_active_session_read on public.lesson_versions for select to authenticated
  using (exists (
    select 1 from public.lesson_sessions s
    where s.lesson_version_id = lesson_versions.id and s.user_id = auth.uid() and s.status = 'active'
  ));
create policy versions_content_staff_all on public.lesson_versions for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'lesson_story_lines','lesson_vocabulary','lesson_grammar','lesson_reading_sections',
    'lesson_listening_activities','lesson_speaking_activities','lesson_review_activities','lesson_assets'
  ]
  loop
    execute format(
      'create policy %I_public_read on public.%I for select to anon, authenticated using (exists (select 1 from public.lessons l where l.status = ''published'' and l.current_version_id = %I.lesson_version_id))',
      table_name, table_name, table_name
    );
    execute format(
      'create policy %I_active_session_read on public.%I for select to authenticated using (exists (select 1 from public.lesson_sessions s where s.lesson_version_id = %I.lesson_version_id and s.user_id = auth.uid() and s.status = ''active''))',
      table_name, table_name, table_name
    );
    execute format(
      'create policy %I_staff_all on public.%I for all to authenticated using (public.has_app_role(array[''admin'',''content_editor'']::public.app_role[])) with check (public.has_app_role(array[''admin'',''content_editor'']::public.app_role[]))',
      table_name, table_name
    );
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'curriculum_levels','curriculum_items','grammar_records','kanji_records','vocabulary_records','image_assets','audio_assets','achievements'
  ]
  loop
    execute format(
      'create policy %I_content_staff_all on public.%I for all to authenticated using (public.has_app_role(array[''admin'',''content_editor'']::public.app_role[])) with check (public.has_app_role(array[''admin'',''content_editor'']::public.app_role[]))',
      table_name, table_name
    );
  end loop;
end $$;

create policy curriculum_levels_authenticated_read on public.curriculum_levels for select to authenticated
  using (public.current_app_role() is not null);
create policy curriculum_items_authenticated_read on public.curriculum_items for select to authenticated
  using (archived_at is null and public.current_app_role() is not null);
create policy grammar_records_authenticated_read on public.grammar_records for select to authenticated
  using (archived_at is null and public.current_app_role() is not null);
create policy kanji_records_authenticated_read on public.kanji_records for select to authenticated
  using (archived_at is null and public.current_app_role() is not null);
create policy vocabulary_records_authenticated_read on public.vocabulary_records for select to authenticated
  using (archived_at is null and public.current_app_role() is not null);
create policy image_assets_authenticated_read on public.image_assets for select to authenticated
  using (archived_at is null and status = 'active' and public.current_app_role() is not null);
create policy audio_assets_authenticated_read on public.audio_assets for select to authenticated
  using (archived_at is null and status = 'active' and public.current_app_role() is not null);
create policy achievements_authenticated_read on public.achievements for select to authenticated
  using (active and public.current_app_role() is not null);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'lesson_sessions','lesson_activity_answers','lesson_events','learner_mastery',
    'review_queue','review_sessions','review_activity_answers',
    'weekly_activity','custom_lesson_requests'
  ]
  loop
    execute format('create policy %I_own_select on public.%I for select to authenticated using (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_own_insert on public.%I for insert to authenticated with check (user_id = auth.uid())', table_name, table_name);
    execute format('create policy %I_own_update on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name, table_name);
  end loop;
end $$;

create policy lesson_completions_own_select on public.lesson_completions for select to authenticated
  using (user_id = auth.uid());
create policy review_results_own_select on public.review_results for select to authenticated
  using (user_id = auth.uid());
create policy user_achievements_own_select on public.user_achievements for select to authenticated
  using (user_id = auth.uid());

create policy active_session_update_only on public.lesson_sessions as restrictive for update to authenticated
  using (user_id = auth.uid() and status = 'active')
  with check (user_id = auth.uid());

create policy jobs_owner_read on public.generated_lesson_jobs for select to authenticated
  using (created_by = auth.uid());
create policy jobs_staff_all on public.generated_lesson_jobs for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));
create policy validation_staff_all on public.lesson_validation_runs for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));
create policy checks_staff_all on public.lesson_validation_checks for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

create policy reports_own_insert on public.lesson_reports for insert to authenticated with check (user_id = auth.uid());
create policy reports_own_read on public.lesson_reports for select to authenticated using (user_id = auth.uid());
create policy reports_staff_all on public.lesson_reports for all to authenticated
  using (public.has_app_role(array['admin','support']::public.app_role[]))
  with check (public.has_app_role(array['admin','support']::public.app_role[]));

create policy tickets_own_insert on public.support_tickets for insert to authenticated with check (user_id = auth.uid());
create policy tickets_own_read on public.support_tickets for select to authenticated using (user_id = auth.uid());
create policy tickets_staff_all on public.support_tickets for all to authenticated
  using (public.has_app_role(array['admin','support']::public.app_role[]))
  with check (public.has_app_role(array['admin','support']::public.app_role[]));
create policy messages_visible_to_owner on public.support_messages for select to authenticated
  using (user_id = auth.uid() and internal = false);
create policy messages_owner_insert on public.support_messages for insert to authenticated
  with check (user_id = auth.uid() and author_id = auth.uid() and author_role = 'learner' and internal = false);
create policy messages_staff_all on public.support_messages for all to authenticated
  using (public.has_app_role(array['admin','support']::public.app_role[]))
  with check (public.has_app_role(array['admin','support']::public.app_role[]));

create policy public_feature_flags_read on public.feature_flags for select to anon, authenticated using (public = true);
create policy feature_flags_admin_all on public.feature_flags for all to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]))
  with check (public.has_app_role(array['admin']::public.app_role[]));
create policy service_status_authenticated_read on public.service_status for select to authenticated
  using (public.current_app_role() is not null);
create policy service_status_admin_all on public.service_status for all to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]))
  with check (public.has_app_role(array['admin']::public.app_role[]));
create policy costs_admin_read on public.cost_records for select to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]));
create policy costs_admin_write on public.cost_records for all to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]))
  with check (public.has_app_role(array['admin']::public.app_role[]));
create policy audit_staff_read on public.audit_logs for select to authenticated
  using (public.has_app_role(array['admin']::public.app_role[]));
-- No authenticated INSERT policy is intentional: trusted server clients write audit rows.
create policy ledger_own_read on public.reward_ledger for select to authenticated using (user_id = auth.uid());
