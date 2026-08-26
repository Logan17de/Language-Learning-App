-- Local JMdict cache used by lesson generation. Runtime lesson workers must not
-- depend on public dictionary HTTP APIs; JMdict is imported out of band and
-- queried in one local Supabase call per generated Japanese region.

create table if not exists public.jmdict_entries (
  entry_key text primary key,
  entry_seq bigint not null,
  dictionary_form text not null check (btrim(dictionary_form) <> ''),
  reading text not null check (btrim(reading) <> ''),
  meaning text not null check (btrim(meaning) <> ''),
  meanings text[] not null default '{}',
  part_of_speech text not null check (
    part_of_speech in (
      'noun', 'verb', 'i-adjective', 'na-adjective',
      'adverb', 'expression', 'other'
    )
  ),
  conjugation_type text check (
    conjugation_type is null or conjugation_type in (
      'ichidan', 'godan-u', 'godan-ku', 'godan-gu', 'godan-su',
      'godan-tsu', 'godan-nu', 'godan-bu', 'godan-mu', 'godan-ru',
      'suru', 'kuru', 'aru'
    )
  ),
  aliases text[] not null default '{}',
  search_forms text[] not null check (cardinality(search_forms) > 0),
  common boolean not null default false,
  priority integer not null default 0,
  source_version text not null check (btrim(source_version) <> ''),
  imported_at timestamptz not null default now(),
  check ((part_of_speech = 'verb') = (conjugation_type is not null))
);

create index if not exists jmdict_entries_entry_seq_idx
  on public.jmdict_entries (entry_seq);
create index if not exists jmdict_entries_dictionary_form_idx
  on public.jmdict_entries (dictionary_form);
create index if not exists jmdict_entries_reading_idx
  on public.jmdict_entries (reading);
create index if not exists jmdict_entries_search_forms_idx
  on public.jmdict_entries using gin (search_forms);

create table if not exists public.jmdict_import_state (
  singleton boolean primary key default true check (singleton),
  source_version text not null,
  source_url text not null,
  entry_count bigint not null default 0 check (entry_count >= 0),
  imported_at timestamptz not null default now()
);

alter table public.jmdict_entries enable row level security;
alter table public.jmdict_import_state enable row level security;

revoke all on table public.jmdict_entries from anon, authenticated;
revoke all on table public.jmdict_import_state from anon, authenticated;

create or replace function public.lookup_jmdict_vocabulary(
  p_surfaces text[],
  p_limit integer default 500
)
returns table (
  entry_key text,
  entry_seq bigint,
  dictionary_form text,
  reading text,
  meaning text,
  meanings text[],
  part_of_speech text,
  conjugation_type text,
  aliases text[],
  search_forms text[],
  common boolean,
  priority integer
)
language sql
stable
security definer
set search_path = public
as $$
  with requested as (
    select coalesce(array_agg(distinct btrim(value)), '{}') as surfaces
    from unnest(coalesce(p_surfaces, '{}'::text[])) value
    where btrim(value) <> ''
  )
  select
    entry.entry_key,
    entry.entry_seq,
    entry.dictionary_form,
    entry.reading,
    entry.meaning,
    entry.meanings,
    entry.part_of_speech,
    entry.conjugation_type,
    entry.aliases,
    entry.search_forms,
    entry.common,
    entry.priority
  from public.jmdict_entries entry
  cross join requested
  where entry.search_forms && requested.surfaces
  order by entry.common desc, entry.priority desc, entry.entry_seq, entry.entry_key
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.lookup_jmdict_vocabulary(text[], integer) from public;
grant execute on function public.lookup_jmdict_vocabulary(text[], integer) to service_role;

create or replace function public.finalize_jmdict_import(
  p_source_version text,
  p_source_url text,
  p_entry_count bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_source_version, '')) = ''
     or btrim(coalesce(p_source_url, '')) = ''
     or coalesce(p_entry_count, 0) <= 0 then
    raise exception 'Invalid JMdict import metadata' using errcode = '22023';
  end if;

  delete from public.jmdict_entries
  where source_version <> p_source_version;
  get diagnostics v_removed = row_count;

  insert into public.jmdict_import_state (
    singleton,
    source_version,
    source_url,
    entry_count,
    imported_at
  ) values (
    true,
    p_source_version,
    p_source_url,
    p_entry_count,
    now()
  )
  on conflict (singleton) do update
    set source_version = excluded.source_version,
        source_url = excluded.source_url,
        entry_count = excluded.entry_count,
        imported_at = excluded.imported_at;

  return jsonb_build_object(
    'sourceVersion', p_source_version,
    'entryCount', p_entry_count,
    'removedOldRows', v_removed
  );
end
$$;

revoke all on function public.finalize_jmdict_import(text, text, bigint) from public;
grant execute on function public.finalize_jmdict_import(text, text, bigint) to service_role;

comment on table public.jmdict_entries is
  'Locally imported JMdict English vocabulary plus precomputed Japanese forms used by lesson generation.';
comment on column public.jmdict_entries.search_forms is
  'Dictionary, reading, and common inflected forms generated locally from the canonical JMdict entry.';
comment on function public.lookup_jmdict_vocabulary(text[], integer) is
  'Returns local JMdict rows whose precomputed forms overlap the supplied Japanese story surfaces.';
