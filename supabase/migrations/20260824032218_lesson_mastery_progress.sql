-- What the lesson actually moved.
--
-- The completion screen reported four "skill changes" against hardcoded values
-- with a delta that was always zero. To show real movement it needs a reading
-- from before the lesson, and nothing captured one: learner_mastery holds only
-- the present, and the phases apply their evidence incrementally, so by the
-- time a lesson completes the earlier figure is gone.
--
-- So a session records where the learner stood when it began, and completion
-- compares that with where they stand now. Both readings use the same scope as
-- promotion: the learner's level and every level below it.

-- ---------------------------------------------------------------------------
-- One definition of the reading, used for the snapshot and for the comparison,
-- so the two can never drift apart.
-- ---------------------------------------------------------------------------
create or replace function public.learner_mastery_breakdown(
  p_user uuid,
  p_level public.jlpt_level
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select mastery.item_type, mastery.mastery
    from public.learner_mastery mastery
    where mastery.user_id = p_user
      -- The jlpt_level enum is declared easiest-first, so <= is "at or below".
      and (
        (mastery.item_type = 'kanji' and exists (
          select 1 from public.kanji_records record
          where record.id::text = mastery.item_key
            and record.jlpt_level <= p_level))
        or (mastery.item_type = 'vocabulary' and exists (
          select 1 from public.vocabulary_records record
          where record.id::text = mastery.item_key
            and record.jlpt_level <= p_level))
        or (mastery.item_type = 'grammar' and exists (
          select 1 from public.grammar_records record
          where record.id::text = mastery.item_key
            and record.jlpt_level <= p_level))
      )
  )
  select jsonb_build_object(
    'level', p_level,
    'kanji', coalesce((select round(avg(mastery)) from scoped where item_type = 'kanji'), 0)::integer,
    'vocabulary', coalesce((select round(avg(mastery)) from scoped where item_type = 'vocabulary'), 0)::integer,
    'grammar', coalesce((select round(avg(mastery)) from scoped where item_type = 'grammar'), 0)::integer,
    'overall', coalesce((select round(avg(mastery)) from scoped), 0)::integer,
    'trackedItems', (select count(*) from scoped)::integer
  );
$$;

revoke all on function public.learner_mastery_breakdown(uuid, public.jlpt_level)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Where the learner stood when the session began.
-- ---------------------------------------------------------------------------
alter table public.lesson_sessions
  add column if not exists mastery_snapshot jsonb;

comment on column public.lesson_sessions.mastery_snapshot is
  'Mastery breakdown captured when the session started, so completion can report what the lesson moved.';

create or replace function public.capture_lesson_mastery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level public.jlpt_level;
begin
  if new.mastery_snapshot is not null then
    return new;
  end if;
  select current_jlpt_level into v_level
  from public.profiles
  where id = new.user_id;
  if v_level is null then
    return new;
  end if;
  new.mastery_snapshot := public.learner_mastery_breakdown(new.user_id, v_level);
  return new;
end;
$$;

drop trigger if exists capture_lesson_mastery_snapshot on public.lesson_sessions;
create trigger capture_lesson_mastery_snapshot
  before insert on public.lesson_sessions
  for each row execute function public.capture_lesson_mastery_snapshot();

-- ---------------------------------------------------------------------------
-- Before, after, and the difference.
-- ---------------------------------------------------------------------------
create or replace function public.lesson_mastery_progress()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session public.lesson_sessions%rowtype;
  v_level public.jlpt_level;
  v_before jsonb;
  v_after jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- The screen always means the lesson just finished, so resolve that here
  -- rather than making the browser map its own lesson identifier to a session.
  select * into v_session
  from public.lesson_sessions
  where user_id = v_user and status = 'completed'
  order by completed_at desc nulls last, updated_at desc
  limit 1;

  if not found then
    raise exception 'No completed lesson to report on' using errcode = 'P0002';
  end if;

  select current_jlpt_level into v_level
  from public.profiles
  where id = v_user and status = 'active';

  if not found then
    raise exception 'Active learner profile required' using errcode = '42501';
  end if;

  v_after := public.learner_mastery_breakdown(v_user, v_level);
  -- A session started before snapshots existed has no earlier reading. Report
  -- the present with no movement rather than inventing a rise from zero.
  v_before := coalesce(v_session.mastery_snapshot, v_after);

  return jsonb_build_object(
    'level', v_level,
    'hasBaseline', v_session.mastery_snapshot is not null,
    'categories', jsonb_build_array(
      jsonb_build_object('key', 'kanji', 'label', 'Kanji',
        'before', (v_before ->> 'kanji')::integer,
        'after', (v_after ->> 'kanji')::integer),
      jsonb_build_object('key', 'vocabulary', 'label', 'Vocabulary',
        'before', (v_before ->> 'vocabulary')::integer,
        'after', (v_after ->> 'vocabulary')::integer),
      jsonb_build_object('key', 'grammar', 'label', 'Grammar',
        'before', (v_before ->> 'grammar')::integer,
        'after', (v_after ->> 'grammar')::integer)
    ),
    'overall', jsonb_build_object(
      'key', 'overall', 'label', 'Overall',
      'before', (v_before ->> 'overall')::integer,
      'after', (v_after ->> 'overall')::integer
    )
  );
end;
$$;

revoke all on function public.lesson_mastery_progress() from public, anon;
grant execute on function public.lesson_mastery_progress() to authenticated, service_role;

comment on function public.lesson_mastery_progress() is
  'Mastery before and after one lesson, by category and overall, scoped to the learner''s level and below.';

do $$
begin
  if not has_function_privilege('authenticated', 'public.lesson_mastery_progress()', 'EXECUTE') then
    raise exception 'a learner must be able to see what their lesson moved';
  end if;
  if has_function_privilege('anon', 'public.lesson_mastery_progress()', 'EXECUTE') then
    raise exception 'lesson mastery progress must not be readable without signing in';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'lesson_sessions'
      and column_name = 'mastery_snapshot'
  ) then
    raise exception 'the session must be able to record where the learner started';
  end if;
end
$$;
