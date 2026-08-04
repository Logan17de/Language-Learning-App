-- Persist the separate reading passage question bank produced after reading
-- vocabulary enrichment. Answers are reference answers; learner responses are
-- stored in the lesson checkpoint because equivalent Japanese wording is valid.

create table public.lesson_reading_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_version_id uuid not null
    references public.lesson_versions(id) on delete cascade,
  position integer not null check (position > 0),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  question text not null check (btrim(question) <> ''),
  answer text not null check (btrim(answer) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_version_id, position)
);

create index lesson_reading_questions_version_idx
  on public.lesson_reading_questions (lesson_version_id, position);

alter table public.lesson_reading_questions enable row level security;

create policy lesson_reading_questions_public_read
  on public.lesson_reading_questions for select to anon, authenticated
  using (exists (
    select 1
    from public.lessons lesson
    where lesson.current_version_id = lesson_reading_questions.lesson_version_id
      and lesson.status = 'published'
      and lesson.archived_at is null
  ));

create policy lesson_reading_questions_active_session_read
  on public.lesson_reading_questions for select to authenticated
  using (exists (
    select 1
    from public.lesson_sessions session
    where session.lesson_version_id = lesson_reading_questions.lesson_version_id
      and session.user_id = auth.uid()
      and session.status = 'active'
  ));

create policy lesson_reading_questions_staff_all
  on public.lesson_reading_questions for all to authenticated
  using (public.has_app_role(array['admin', 'content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin', 'content_editor']::public.app_role[]));

grant select on public.lesson_reading_questions to anon, authenticated;
grant insert, update, delete on public.lesson_reading_questions to authenticated;

create trigger lesson_reading_questions_updated_at
before update on public.lesson_reading_questions
for each row execute function public.set_updated_at();

-- Preserve the proven package writer and layer reading-question persistence on
-- top. This avoids copying the large V2 storage function and keeps older
-- lesson packages compatible with the same canonical tables.
alter function public.store_generated_lesson_package_background(uuid, jsonb, integer)
  rename to store_generated_lesson_package_background_base;

create or replace function public.store_generated_lesson_package_background(
  p_request_id uuid,
  p_package jsonb,
  p_generation_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_version_id uuid;
  v_item record;
  v_easy integer;
  v_medium integer;
  v_hard integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_package->'readingQuestions') <> 'array'
     or jsonb_array_length(p_package->'readingQuestions') not between 3 and 10 then
    raise exception 'Invalid reading comprehension question bank'
      using errcode = '22023';
  end if;

  select
    count(*) filter (where value->>'difficulty' = 'easy'),
    count(*) filter (where value->>'difficulty' = 'medium'),
    count(*) filter (where value->>'difficulty' = 'hard')
  into v_easy, v_medium, v_hard
  from jsonb_array_elements(p_package->'readingQuestions');

  if v_easy < 1 or v_medium < 1 or v_hard < 1 then
    raise exception 'Reading questions require easy, medium, and hard items'
      using errcode = '22023';
  end if;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'readingQuestions') with ordinality
  loop
    if v_item.value->>'difficulty' not in ('easy', 'medium', 'hard')
       or btrim(coalesce(v_item.value->>'question', '')) = ''
       or btrim(coalesce(v_item.value->>'answer', '')) = '' then
      raise exception 'Invalid reading question at position %', v_item.ordinality
        using errcode = '22023';
    end if;
  end loop;

  v_result := public.store_generated_lesson_package_background_base(
    p_request_id,
    p_package,
    greatest(0, p_generation_seconds)
  );
  v_version_id := (v_result->>'lesson_version_id')::uuid;

  if v_version_id is null then
    raise exception 'Stored lesson version was not returned' using errcode = '22023';
  end if;

  -- Reused packages already have the same reading bank. Preserve stable row IDs
  -- so checkpoints from another active learner remain valid.
  if coalesce((v_result->>'reused')::boolean, false) then
    return v_result;
  end if;

  delete from public.lesson_reading_questions
  where lesson_version_id = v_version_id;

  for v_item in
    select value, ordinality
    from jsonb_array_elements(p_package->'readingQuestions') with ordinality
  loop
    insert into public.lesson_reading_questions (
      lesson_version_id,
      position,
      difficulty,
      question,
      answer
    ) values (
      v_version_id,
      v_item.ordinality,
      v_item.value->>'difficulty',
      v_item.value->>'question',
      v_item.value->>'answer'
    );
  end loop;

  update public.lesson_versions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'readingTitle', coalesce(p_package->>'readingTitle', ''),
    'readingJapaneseTitle', coalesce(p_package->>'readingJapaneseTitle', '')
  )
  where id = v_version_id;

  return v_result;
end
$$;

revoke all on function public.store_generated_lesson_package_background_base(
  uuid, jsonb, integer
) from public;
revoke all on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) from public;
grant execute on function public.store_generated_lesson_package_background_base(
  uuid, jsonb, integer
) to service_role;
grant execute on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) to service_role;

comment on table public.lesson_reading_questions is
  'Japanese essay-style comprehension questions grounded in the saved reading passage.';
comment on function public.store_generated_lesson_package_background(
  uuid, jsonb, integer
) is
  'Stores a generated V2 lesson and its strict reading-comprehension question bank.';
