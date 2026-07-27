-- Normalize every reusable vocabulary reading through one shared kana table.
-- This migration is intentionally separate because the earlier V2 migrations
-- may already be present in the remote migration history.

create table public.kana_records (
  id uuid primary key default gen_random_uuid(),
  value text not null,
  normalized_value text generated always as (
    normalize(btrim(value), NFKC)
  ) stored,
  script_type text not null
    check (script_type in ('hiragana', 'katakana', 'mixed')),
  usage_count integer not null default 0 check (usage_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    normalized_value <> ''
    and normalized_value ~ '^[ぁ-ゖゝゞァ-ヺヽヾー]+$'
  ),
  check (
    (script_type = 'hiragana' and normalized_value ~ '^[ぁ-ゖゝゞー]+$')
    or (script_type = 'katakana' and normalized_value ~ '^[ァ-ヺヽヾー]+$')
    or (
      script_type = 'mixed'
      and normalized_value ~ '[ぁ-ゖゝゞ]'
      and normalized_value ~ '[ァ-ヺヽヾ]'
    )
  ),
  unique (normalized_value)
);

alter table public.kana_records enable row level security;

create policy kana_records_authenticated_read
  on public.kana_records for select to authenticated
  using (public.current_app_role() is not null);

create policy kana_records_staff_all
  on public.kana_records for all to authenticated
  using (public.has_app_role(array['admin','content_editor']::public.app_role[]))
  with check (public.has_app_role(array['admin','content_editor']::public.app_role[]));

grant select on public.kana_records to authenticated;
grant insert, update, delete on public.kana_records to authenticated;

drop trigger if exists kana_records_updated_at on public.kana_records;
create trigger kana_records_updated_at
before update on public.kana_records
for each row execute function public.set_updated_at();

insert into public.kana_records (value, script_type, usage_count)
select
  normalize(btrim(reading), NFKC),
  case
    when normalize(btrim(reading), NFKC) ~ '^[ぁ-ゖゝゞー]+$'
      then 'hiragana'
    when normalize(btrim(reading), NFKC) ~ '^[ァ-ヺヽヾー]+$'
      then 'katakana'
    else 'mixed'
  end,
  count(*)
from public.vocabulary_records
where normalize(btrim(reading), NFKC) ~ '^[ぁ-ゖゝゞァ-ヺヽヾー]+$'
group by normalize(btrim(reading), NFKC)
on conflict (normalized_value) do nothing;

alter table public.vocabulary_records
  add column kana_id uuid references public.kana_records(id)
    on delete restrict;

update public.vocabulary_records vocabulary
set kana_id = kana.id,
    reading = kana.normalized_value
from public.kana_records kana
where kana.normalized_value = normalize(btrim(vocabulary.reading), NFKC)
  and vocabulary.kana_id is null;

do $$
begin
  if exists (
    select 1
    from public.vocabulary_records
    where kana_id is null
  ) then
    raise exception 'Every vocabulary reading must contain only hiragana or katakana';
  end if;
end
$$;

alter table public.vocabulary_records
  alter column kana_id set not null;

create index vocabulary_records_kana_lookup_idx
  on public.vocabulary_records (kana_id)
  where archived_at is null and quality_status <> 'rejected';

create or replace function public.link_vocabulary_kana()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reading text;
  v_kana_id uuid;
begin
  v_reading := normalize(btrim(coalesce(new.reading, '')), NFKC);
  if v_reading = ''
     or v_reading !~ '^[ぁ-ゖゝゞァ-ヺヽヾー]+$' then
    raise exception 'Vocabulary reading must contain only hiragana or katakana'
      using errcode = '22023';
  end if;

  insert into public.kana_records (value, script_type)
  values (
    v_reading,
    case
      when v_reading ~ '^[ぁ-ゖゝゞー]+$' then 'hiragana'
      when v_reading ~ '^[ァ-ヺヽヾー]+$' then 'katakana'
      else 'mixed'
    end
  )
  on conflict (normalized_value) do update
    set usage_count = public.kana_records.usage_count + 1,
        updated_at = now()
  returning id into v_kana_id;

  new.kana_id := v_kana_id;
  new.written_form := normalize(btrim(new.written_form), NFKC);
  new.reading := v_reading;
  return new;
end
$$;

drop trigger if exists vocabulary_records_link_kana
  on public.vocabulary_records;
create trigger vocabulary_records_link_kana
before insert or update of written_form, reading, kana_id
on public.vocabulary_records
for each row execute function public.link_vocabulary_kana();
