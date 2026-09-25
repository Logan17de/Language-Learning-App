-- Make five-kanji target uniqueness a database invariant.
-- A target set is permanently reserved once it has entered lesson-generation
-- history, regardless of whether the provider later succeeds or fails.

create or replace function public.lesson_generation_kanji_signature(
  p_target_kanji text[]
)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select array_to_string(
    array(
      select value
      from unnest(p_target_kanji) as valueset(value)
      order by value collate "C"
    ),
    chr(31)
  )
$$;

create or replace function public.lesson_generation_has_five_distinct_kanji(
  p_target_kanji text[]
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select cardinality(p_target_kanji) = 5
    and (
      select count(distinct value)
      from unnest(p_target_kanji) as valueset(value)
    ) = 5
    and not exists (
      select 1
      from unnest(p_target_kanji) as valueset(value)
      where value is null or btrim(value) = ''
    )
$$;

create table if not exists public.lesson_generation_kanji_reservations (
  id uuid primary key default gen_random_uuid(),
  jlpt_level public.jlpt_level not null,
  target_kanji text[] not null
    check (public.lesson_generation_has_five_distinct_kanji(target_kanji)),
  signature text generated always as (
    public.lesson_generation_kanji_signature(target_kanji)
  ) stored,
  generation_batch_id uuid references public.lesson_generation_batches(id) on delete set null,
  custom_id text,
  created_at timestamptz not null default now(),
  unique (jlpt_level, signature)
);

create index if not exists lesson_generation_kanji_reservations_batch_idx
  on public.lesson_generation_kanji_reservations (generation_batch_id);

alter table public.lesson_generation_kanji_reservations enable row level security;
revoke all on table public.lesson_generation_kanji_reservations from public, anon, authenticated;
grant all on table public.lesson_generation_kanji_reservations to service_role;

-- Preserve the user's strict historical rule: every five-kanji set that ever
-- reached staging remains blocked, including invalid/API-failed generations.
insert into public.lesson_generation_kanji_reservations (
  jlpt_level,
  target_kanji,
  generation_batch_id,
  custom_id,
  created_at
)
select
  request.jlpt_level,
  request.target_kanji,
  request.generation_batch_id,
  request.custom_id,
  request.created_at
from public.lesson_generation_requests request
where public.lesson_generation_has_five_distinct_kanji(request.target_kanji)
on conflict (jlpt_level, signature) do nothing;

create or replace function public.reserve_lesson_generation_kanji_set(
  p_jlpt_level public.jlpt_level,
  p_target_kanji text[],
  p_generation_batch_id uuid,
  p_custom_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.lesson_generation_has_five_distinct_kanji(p_target_kanji) then
    raise exception 'Lesson target reservation requires exactly five distinct kanji.'
      using errcode = '22023';
  end if;

  insert into public.lesson_generation_kanji_reservations (
    jlpt_level,
    target_kanji,
    generation_batch_id,
    custom_id
  )
  values (
    p_jlpt_level,
    p_target_kanji,
    p_generation_batch_id,
    p_custom_id
  )
  on conflict (jlpt_level, signature) do nothing;

  return found;
end
$$;

revoke all on function public.lesson_generation_kanji_signature(text[]) from public;
revoke all on function public.lesson_generation_has_five_distinct_kanji(text[]) from public;
revoke all on function public.reserve_lesson_generation_kanji_set(public.jlpt_level, text[], uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_lesson_generation_kanji_set(public.jlpt_level, text[], uuid, text) to service_role;

comment on table public.lesson_generation_kanji_reservations is
  'Permanent, order-independent five-kanji reservations used to prevent duplicate target sets per JLPT level under concurrent Batch creation.';
comment on function public.reserve_lesson_generation_kanji_set(public.jlpt_level, text[], uuid, text) is
  'Atomically reserves one five-kanji target set. Returns false when that exact set was already reserved for the JLPT level.';
