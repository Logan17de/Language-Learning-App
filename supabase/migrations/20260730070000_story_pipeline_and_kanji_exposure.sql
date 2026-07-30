-- Lock the custom lesson pipeline to a story-only first call and track the
-- learner-specific kanji exposure threshold used for visible story readings.

create table if not exists public.learner_story_kanji_exposures (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null references public.custom_lesson_requests(id) on delete cascade,
  character text not null check (char_length(character) = 1 and character !~ '[[:space:]]'),
  occurrence_count smallint not null check (occurrence_count between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id, character)
);

create table if not exists public.learner_kanji_exposure_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  character text not null check (char_length(character) = 1 and character !~ '[[:space:]]'),
  appearance_count integer not null default 0 check (appearance_count >= 0),
  known_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, character)
);

create index if not exists learner_kanji_exposure_known_idx
  on public.learner_kanji_exposure_progress(user_id, appearance_count desc)
  where appearance_count >= 10;

alter table public.learner_story_kanji_exposures enable row level security;
alter table public.learner_kanji_exposure_progress enable row level security;

drop policy if exists learner_story_kanji_exposures_select_own
  on public.learner_story_kanji_exposures;
create policy learner_story_kanji_exposures_select_own
  on public.learner_story_kanji_exposures
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists learner_kanji_exposure_progress_select_own
  on public.learner_kanji_exposure_progress;
create policy learner_kanji_exposure_progress_select_own
  on public.learner_kanji_exposure_progress
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.record_story_kanji_exposures(
  p_request_id uuid,
  p_counts jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_character text;
  v_count integer;
  v_inserted_count integer;
  v_recorded integer := 0;
  v_total_occurrences integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.custom_lesson_requests request
    where request.id = p_request_id
      and request.user_id = v_user_id
  ) then
    raise exception 'Lesson request unavailable' using errcode = '42501';
  end if;

  if jsonb_typeof(p_counts) <> 'array'
     or jsonb_array_length(p_counts) > 200 then
    raise exception 'Invalid story kanji exposure payload' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_counts)
  loop
    v_character := trim(coalesce(v_item->>'character', ''));
    begin
      v_count := (v_item->>'count')::integer;
    exception when others then
      raise exception 'Invalid story kanji count' using errcode = '22023';
    end;

    if char_length(v_character) <> 1
       or v_character ~ '[[:space:]]'
       or v_count not between 1 and 100 then
      raise exception 'Invalid story kanji exposure' using errcode = '22023';
    end if;

    v_inserted_count := null;
    insert into public.learner_story_kanji_exposures (
      user_id,
      request_id,
      character,
      occurrence_count
    ) values (
      v_user_id,
      p_request_id,
      v_character,
      v_count
    )
    on conflict (user_id, request_id, character) do nothing
    returning occurrence_count into v_inserted_count;

    if v_inserted_count is not null then
      insert into public.learner_kanji_exposure_progress (
        user_id,
        character,
        appearance_count,
        known_at,
        first_seen_at,
        last_seen_at
      ) values (
        v_user_id,
        v_character,
        v_inserted_count,
        case when v_inserted_count >= 10 then now() else null end,
        now(),
        now()
      )
      on conflict (user_id, character) do update
      set appearance_count =
            public.learner_kanji_exposure_progress.appearance_count
            + excluded.appearance_count,
          known_at = case
            when public.learner_kanji_exposure_progress.appearance_count
                 + excluded.appearance_count >= 10
              then coalesce(
                public.learner_kanji_exposure_progress.known_at,
                now()
              )
            else public.learner_kanji_exposure_progress.known_at
          end,
          last_seen_at = now();

      v_recorded := v_recorded + 1;
      v_total_occurrences := v_total_occurrences + v_inserted_count;
    end if;
  end loop;

  return jsonb_build_object(
    'recordedCharacters', v_recorded,
    'recordedOccurrences', v_total_occurrences,
    'knownThreshold', 10
  );
end
$$;

revoke all on function public.record_story_kanji_exposures(uuid, jsonb) from public;
grant execute on function public.record_story_kanji_exposures(uuid, jsonb)
  to authenticated;

comment on table public.learner_kanji_exposure_progress is
  'Learner-specific story appearance counts. A kanji becomes known at ten appearances.';
comment on function public.record_story_kanji_exposures(uuid, jsonb) is
  'Idempotently records kanji occurrences for one owned custom lesson request.';
