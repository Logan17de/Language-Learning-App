create or replace function public.complete_lesson_session(
  p_session_id uuid,
  p_score integer,
  p_xp integer,
  p_duration_minutes integer,
  p_completion_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.lesson_sessions%rowtype;
  v_ledger public.reward_ledger%rowtype;
  v_result jsonb;
  v_vocabulary_correct integer;
  v_vocabulary_total integer;
  v_grammar_correct integer;
  v_grammar_total integer;
  v_review_correct integer;
  v_review_total integer;
  v_calculated_score integer;
  v_last_activity_date date;
  v_current_streak integer;
  v_new_streak integer;
begin
  if p_score not between 0 and 100 or p_xp not between 0 and 500 or p_duration_minutes not between 0 and 1440 then
    raise exception 'Invalid completion metrics' using errcode = '22023';
  end if;
  if jsonb_typeof(p_completion_data->'metrics') <> 'object' then
    raise exception 'Completion scoring metrics are required' using errcode = '22023';
  end if;
  v_vocabulary_correct := (p_completion_data #>> '{metrics,vocabulary_correct}')::integer;
  v_vocabulary_total := (p_completion_data #>> '{metrics,vocabulary_total}')::integer;
  v_grammar_correct := (p_completion_data #>> '{metrics,grammar_correct}')::integer;
  v_grammar_total := (p_completion_data #>> '{metrics,grammar_total}')::integer;
  v_review_correct := (p_completion_data #>> '{metrics,review_correct}')::integer;
  v_review_total := (p_completion_data #>> '{metrics,review_total}')::integer;
  if v_vocabulary_total <= 0 or v_grammar_total <= 0 or v_review_total <= 0
     or v_vocabulary_correct not between 0 and v_vocabulary_total
     or v_grammar_correct not between 0 and v_grammar_total
     or v_review_correct not between 0 and v_review_total then
    raise exception 'Invalid completion answer counts' using errcode = '22023';
  end if;
  v_calculated_score := round(
    (v_review_correct::numeric / v_review_total) * 60
    + (v_vocabulary_correct::numeric / v_vocabulary_total) * 20
    + (v_grammar_correct::numeric / v_grammar_total) * 20
  );
  if abs(v_calculated_score - p_score) > 1 then
    raise exception 'Completion score does not match answer counts' using errcode = '22023';
  end if;
  select * into v_session from public.lesson_sessions where id = p_session_id for update;
  if not found or v_session.user_id <> auth.uid() then raise exception 'Session not found' using errcode = 'P0002'; end if;

  select * into v_ledger from public.reward_ledger where reward_type = 'lesson' and source_id = p_session_id;
  if found then return v_ledger.canonical_result; end if;
  if v_session.status <> 'active' then
    raise exception 'Session is not active' using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'session_id', p_session_id, 'lesson_id', v_session.lesson_id, 'lesson_version_id', v_session.lesson_version_id,
    'score', p_score, 'xp_awarded', p_xp, 'duration_minutes', p_duration_minutes, 'rewarded', true
  );

  insert into public.lesson_completions (
    user_id, lesson_id, lesson_version_id, lesson_session_id, score, xp_awarded, duration_minutes, completion_data
  ) values (
    v_session.user_id, v_session.lesson_id, v_session.lesson_version_id, p_session_id, p_score, p_xp, p_duration_minutes, p_completion_data
  ) on conflict (lesson_session_id) do nothing;

  insert into public.reward_ledger (user_id, reward_type, source_id, xp_awarded, canonical_result)
  values (v_session.user_id, 'lesson', p_session_id, p_xp, v_result)
  on conflict (reward_type, source_id) do nothing
  returning * into v_ledger;

  if not found then
    select * into v_ledger from public.reward_ledger where reward_type = 'lesson' and source_id = p_session_id;
    return v_ledger.canonical_result;
  end if;

  update public.lesson_sessions set status = 'completed', completed_at = now(), reward_claimed_at = now() where id = p_session_id;
  select streak_days into v_current_streak from public.profiles where id = v_session.user_id for update;
  select max(activity_date) into v_last_activity_date from public.weekly_activity where user_id = v_session.user_id;
  v_new_streak := case
    when v_last_activity_date = current_date then v_current_streak
    when v_last_activity_date = current_date - 1 then v_current_streak + 1
    else 1
  end;
  update public.profiles
    set xp = xp + p_xp,
        streak_days = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        total_study_minutes = total_study_minutes + p_duration_minutes
    where id = v_session.user_id;
  insert into public.weekly_activity (user_id, activity_date, minutes, lesson_minutes)
    values (v_session.user_id, current_date, p_duration_minutes, p_duration_minutes)
    on conflict (user_id, activity_date) do update
      set minutes = weekly_activity.minutes + excluded.minutes,
          lesson_minutes = weekly_activity.lesson_minutes + excluded.lesson_minutes;
  return v_result;
end;
$$;

create or replace function public.claim_lesson_reward(p_session_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select canonical_result from public.reward_ledger
  where reward_type = 'lesson' and source_id = p_session_id and user_id = auth.uid()
$$;

create or replace function public.complete_review_session(
  p_session_id uuid,
  p_score integer,
  p_correct_count integer,
  p_total_count integer,
  p_improved_item_ids text[],
  p_weak_item_ids text[],
  p_xp integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.review_sessions%rowtype;
  v_ledger public.reward_ledger%rowtype;
  v_result jsonb;
  v_last_activity_date date;
  v_current_streak integer;
  v_new_streak integer;
begin
  if p_score not between 0 and 100 or p_xp not between 0 and 500 or p_total_count <= 0
     or p_correct_count < 0 or p_correct_count > p_total_count then
    raise exception 'Invalid review metrics' using errcode = '22023';
  end if;
  if abs(round((p_correct_count::numeric / p_total_count) * 100) - p_score) > 1 then
    raise exception 'Review score does not match answer counts' using errcode = '22023';
  end if;
  select * into v_session from public.review_sessions where id = p_session_id for update;
  if not found or v_session.user_id <> auth.uid() then raise exception 'Session not found' using errcode = 'P0002'; end if;
  select * into v_ledger from public.reward_ledger where reward_type = 'review' and source_id = p_session_id;
  if found then return v_ledger.canonical_result; end if;
  if v_session.status <> 'active' then
    raise exception 'Session is not active' using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'session_id', p_session_id, 'score', p_score, 'correct_count', p_correct_count,
    'total_count', p_total_count, 'xp_awarded', p_xp, 'rewarded', true
  );
  insert into public.review_results (
    user_id, review_session_id, score, correct_count, total_count, improved_item_ids, weak_item_ids, xp_awarded
  ) values (
    v_session.user_id, p_session_id, p_score, p_correct_count, p_total_count,
    p_improved_item_ids, p_weak_item_ids, p_xp
  ) on conflict (review_session_id) do nothing;
  insert into public.reward_ledger (user_id, reward_type, source_id, xp_awarded, canonical_result)
    values (v_session.user_id, 'review', p_session_id, p_xp, v_result)
    on conflict (reward_type, source_id) do nothing returning * into v_ledger;
  if not found then
    select * into v_ledger from public.reward_ledger where reward_type = 'review' and source_id = p_session_id;
    return v_ledger.canonical_result;
  end if;

  update public.review_sessions set status = 'completed', completed_at = now(), score = p_score, xp_awarded = p_xp, reward_claimed_at = now() where id = p_session_id;
  select streak_days into v_current_streak from public.profiles where id = v_session.user_id for update;
  select max(activity_date) into v_last_activity_date from public.weekly_activity where user_id = v_session.user_id;
  v_new_streak := case
    when v_last_activity_date = current_date then v_current_streak
    when v_last_activity_date = current_date - 1 then v_current_streak + 1
    else 1
  end;
  update public.profiles
    set xp = xp + p_xp,
        streak_days = v_new_streak,
        longest_streak = greatest(longest_streak, v_new_streak),
        total_study_minutes = total_study_minutes + 5
    where id = v_session.user_id;
  update public.review_queue set confidence = least(100, confidence + 12), due_at = now() + interval '3 days', status = 'scheduled'
    where (id::text = any(p_improved_item_ids) or item_key = any(p_improved_item_ids)) and user_id = v_session.user_id;
  update public.review_queue set confidence = greatest(0, confidence - 4), due_at = now(), status = 'due'
    where (id::text = any(p_weak_item_ids) or item_key = any(p_weak_item_ids)) and user_id = v_session.user_id;
  insert into public.weekly_activity (user_id, activity_date, minutes, review_minutes)
    values (v_session.user_id, current_date, 5, 5)
    on conflict (user_id, activity_date) do update
      set minutes = weekly_activity.minutes + 5,
          review_minutes = weekly_activity.review_minutes + 5;
  return v_result;
end;
$$;

create or replace function public.claim_review_reward(p_session_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select canonical_result from public.reward_ledger
  where reward_type = 'review' and source_id = p_session_id and user_id = auth.uid()
$$;

create or replace function public.publish_lesson_version(p_lesson_id uuid, p_change_summary text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lesson public.lessons%rowtype;
  v_source public.lesson_versions%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_number integer;
begin
  if not public.has_app_role(array['admin','content_editor']::public.app_role[]) then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found or v_lesson.current_version_id is null then raise exception 'Lesson version not found' using errcode = 'P0002'; end if;
  select * into v_source from public.lesson_versions where id = v_lesson.current_version_id;
  if not found then raise exception 'Source version not found' using errcode = 'P0002'; end if;
  select coalesce(max(version_number), 0) + 1 into v_number from public.lesson_versions where lesson_id = p_lesson_id;
  insert into public.lesson_versions (id, lesson_id, version_number, status, change_summary, schema_version, answer_keys, review_items, phases, published_at, created_by)
    values (v_new_id, p_lesson_id, v_number, 'published', p_change_summary, v_source.schema_version, v_source.answer_keys, v_source.review_items, v_source.phases, now(), auth.uid());
  insert into public.lesson_story_lines (lesson_version_id, position, japanese_text, translation, tappable_terms, image_asset_id, audio_asset_id)
    select v_new_id, position, japanese_text, translation, tappable_terms, image_asset_id, audio_asset_id from public.lesson_story_lines where lesson_version_id = v_source.id;
  insert into public.lesson_vocabulary (lesson_version_id, position, vocabulary_id, written_form, reading, meaning, part_of_speech, example_sentence)
    select v_new_id, position, vocabulary_id, written_form, reading, meaning, part_of_speech, example_sentence from public.lesson_vocabulary where lesson_version_id = v_source.id;
  insert into public.lesson_grammar (lesson_version_id, position, grammar_id, pattern, meaning, structure, usage_notes, example, translation, common_mistake)
    select v_new_id, position, grammar_id, pattern, meaning, structure, usage_notes, example, translation, common_mistake from public.lesson_grammar where lesson_version_id = v_source.id;
  insert into public.lesson_reading_sections (lesson_version_id, position, speaker, japanese_text, translation, tappable_terms)
    select v_new_id, position, speaker, japanese_text, translation, tappable_terms from public.lesson_reading_sections where lesson_version_id = v_source.id;
  insert into public.lesson_listening_activities (lesson_version_id, position, prompt, transcript, choices, correct_answer, explanation, audio_asset_id)
    select v_new_id, position, prompt, transcript, choices, correct_answer, explanation, audio_asset_id from public.lesson_listening_activities where lesson_version_id = v_source.id;
  insert into public.lesson_speaking_activities (lesson_version_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer)
    select v_new_id, position, mode, prompt, easy_prompt, medium_prompt, hard_prompt, expected_answer, model_answer from public.lesson_speaking_activities where lesson_version_id = v_source.id;
  insert into public.lesson_review_activities (lesson_version_id, position, question_type, category, prompt, choices, correct_answer, explanation)
    select v_new_id, position, question_type, category, prompt, choices, correct_answer, explanation from public.lesson_review_activities where lesson_version_id = v_source.id;
  update public.lessons set current_version_id = v_new_id, status = 'published', published_at = now(), updated_by = auth.uid() where id = p_lesson_id;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, before_summary, after_summary, metadata)
  values (
    auth.uid(), 'lesson.published', 'lesson', p_lesson_id::text,
    jsonb_build_object('lesson_version_id', v_source.id, 'version_number', v_source.version_number),
    jsonb_build_object('lesson_version_id', v_new_id, 'version_number', v_number),
    jsonb_build_object('change_summary', p_change_summary)
  );
  return jsonb_build_object('lesson_id', p_lesson_id, 'lesson_version_id', v_new_id, 'version_number', v_number, 'status', 'published');
end;
$$;

create or replace function public.reset_learner_progress(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() <> p_user_id and not public.has_app_role(array['admin']::public.app_role[]) then
    raise exception 'Permission denied' using errcode = '42501';
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
  update public.profiles set xp = 0, streak_days = 0, longest_streak = 0, total_study_minutes = 0 where id = p_user_id;
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, after_summary, metadata)
  values (auth.uid(), 'learner.progress_reset', 'profile', p_user_id::text, jsonb_build_object('reset', true), '{}'::jsonb);
  return jsonb_build_object('user_id', p_user_id, 'reset', true);
end;
$$;

revoke all on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb) from public;
revoke all on function public.complete_review_session(uuid, integer, integer, integer, text[], text[], integer) from public;
revoke all on function public.claim_lesson_reward(uuid) from public;
revoke all on function public.claim_review_reward(uuid) from public;
revoke all on function public.publish_lesson_version(uuid, text) from public;
revoke all on function public.reset_learner_progress(uuid) from public;
grant execute on function public.complete_lesson_session(uuid, integer, integer, integer, jsonb) to authenticated;
grant execute on function public.claim_lesson_reward(uuid) to authenticated;
grant execute on function public.complete_review_session(uuid, integer, integer, integer, text[], text[], integer) to authenticated;
grant execute on function public.claim_review_reward(uuid) to authenticated;
grant execute on function public.publish_lesson_version(uuid, text) to authenticated;
grant execute on function public.reset_learner_progress(uuid) to authenticated;

create or replace view public.learner_progress_summary with (security_invoker = true) as
select p.id as user_id, p.xp, p.streak_days, p.longest_streak, p.total_study_minutes,
  count(lc.id)::integer as completed_lessons, coalesce(round(avg(lc.score)), 0)::integer as average_lesson_score
from public.profiles p left join public.lesson_completions lc on lc.user_id = p.id
group by p.id;

create or replace view public.learner_weekly_activity with (security_invoker = true) as
select user_id, activity_date, minutes, lesson_minutes, review_minutes
from public.weekly_activity where activity_date >= current_date - 6;

create or replace view public.learner_weak_items with (security_invoker = true) as
select user_id, item_type, item_key, mastery, confidence
from public.learner_mastery where mastery < 70 order by mastery asc;

create or replace view public.lesson_performance_summary with (security_invoker = true) as
select lesson_id, count(*)::integer as completion_count, round(avg(score))::integer as average_score,
  round(avg(duration_minutes))::integer as average_duration_minutes
from public.lesson_completions group by lesson_id;

create or replace view public.admin_dashboard_summary with (security_invoker = true) as
select
  (select count(*)::integer from public.profiles where status = 'active') as total_users,
  (select count(distinct user_id)::integer from public.weekly_activity where activity_date = current_date) as daily_active_users,
  (select count(*)::integer from public.user_subscriptions where plan <> 'free' and status in ('active','trial')) as premium_users,
  (select count(*)::integer from public.lessons where status = 'published') as published_lessons,
  (select count(*)::integer from public.lesson_validation_runs where status in ('checking','warning')) as pending_validations,
  (select count(*)::integer from public.lesson_reports where status in ('new','investigating','confirmed')) as open_reports,
  (select count(*)::integer from public.support_tickets where status in ('new','open','waiting_for_user')) as open_support_tickets;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('lesson-images', 'lesson-images', true, 10485760, array['image/png','image/jpeg','image/webp']),
  ('lesson-audio', 'lesson-audio', false, 15728640, array['audio/mpeg','audio/ogg','audio/wav']),
  ('user-exports', 'user-exports', false, 10485760, array['application/json'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy lesson_images_public_read on storage.objects for select to public using (bucket_id = 'lesson-images');
create policy lesson_images_staff_write on storage.objects for all to authenticated
  using (bucket_id = 'lesson-images' and public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (bucket_id = 'lesson-images' and public.has_app_role(array['admin','content_editor']::public.app_role[]));
create policy lesson_audio_authenticated_read on storage.objects for select to authenticated using (bucket_id = 'lesson-audio');
create policy lesson_audio_staff_write on storage.objects for all to authenticated
  using (bucket_id = 'lesson-audio' and public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (bucket_id = 'lesson-audio' and public.has_app_role(array['admin','content_editor']::public.app_role[]));
create policy user_exports_own_read on storage.objects for select to authenticated
  using (bucket_id = 'user-exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_exports_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'user-exports' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_exports_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'user-exports' and (storage.foldername(name))[1] = auth.uid()::text);
