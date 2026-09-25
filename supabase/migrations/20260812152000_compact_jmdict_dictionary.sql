-- Compact the local JMdict cache. Inflected forms are no longer materialized in
-- every row; runtime lookup derives likely dictionary forms from story surfaces
-- and verifies the final match with the app's conjugation engine.

drop index if exists public.jmdict_entries_search_forms_idx;
alter table public.jmdict_entries drop column if exists search_forms;

create index if not exists jmdict_entries_aliases_idx
  on public.jmdict_entries using gin (aliases);

create or replace function public.jmdict_dictionary_candidates(p_surface text)
returns text[]
language plpgsql
immutable
strict
set search_path = public
as $$
declare
  s text := btrim(normalize(p_surface, NFKC));
  stem text;
  root text;
  last_char text;
  prefix text;
  result text[] := array[]::text[];
  i_from text[] := array['い','き','ぎ','し','ち','に','び','み','り'];
  i_to   text[] := array['う','く','ぐ','す','つ','ぬ','ぶ','む','る'];
  a_from text[] := array['わ','か','が','さ','た','な','ば','ま','ら'];
  a_to   text[] := array['う','く','ぐ','す','つ','ぬ','ぶ','む','る'];
  e_from text[] := array['え','け','げ','せ','て','ね','べ','め','れ'];
  e_to   text[] := array['う','く','ぐ','す','つ','ぬ','ぶ','む','る'];
  idx integer;
  suffix text;
begin
  if s = '' then return result; end if;
  result := array_append(result, s);

  -- Polite/desire forms share the verb's i-stem for godan verbs and bare stem
  -- for ichidan verbs.
  foreach suffix in array array['ませんでした','ました','ません','ます','たかった','たくない','たい'] loop
    if right(s, char_length(suffix)) = suffix and char_length(s) > char_length(suffix) then
      stem := left(s, char_length(s) - char_length(suffix));
      result := array_append(result, stem || 'る');
      last_char := right(stem, 1);
      prefix := left(stem, greatest(char_length(stem) - 1, 0));
      idx := array_position(i_from, last_char);
      if idx is not null then result := array_append(result, prefix || i_to[idx]); end if;
      if last_char = 'し' then result := array_append(result, prefix || 'する'); end if;
      if last_char = 'き' then result := array_append(result, prefix || 'くる'); end if;
    end if;
  end loop;

  -- Negative family.
  foreach suffix in array array['なかった','なくて','なければ','ない'] loop
    if right(s, char_length(suffix)) = suffix and char_length(s) > char_length(suffix) then
      stem := left(s, char_length(s) - char_length(suffix));
      result := array_append(result, stem || 'る');
      last_char := right(stem, 1);
      prefix := left(stem, greatest(char_length(stem) - 1, 0));
      idx := array_position(a_from, last_char);
      if idx is not null then result := array_append(result, prefix || a_to[idx]); end if;
      if last_char = 'し' then result := array_append(result, prefix || 'する'); end if;
      if last_char = 'こ' then result := array_append(result, prefix || 'くる'); end if;
    end if;
  end loop;

  -- Te/past sound changes.
  foreach suffix in array array['った','って'] loop
    if right(s, 2) = suffix and char_length(s) > 2 then
      root := left(s, char_length(s) - 2);
      result := result || array[root || 'う', root || 'つ', root || 'る'];
    end if;
  end loop;
  foreach suffix in array array['んだ','んで'] loop
    if right(s, 2) = suffix and char_length(s) > 2 then
      root := left(s, char_length(s) - 2);
      result := result || array[root || 'む', root || 'ぶ', root || 'ぬ'];
    end if;
  end loop;
  foreach suffix in array array['いた','いて'] loop
    if right(s, 2) = suffix and char_length(s) > 2 then
      root := left(s, char_length(s) - 2);
      result := array_append(result, root || 'く');
    end if;
  end loop;
  foreach suffix in array array['いだ','いで'] loop
    if right(s, 2) = suffix and char_length(s) > 2 then
      root := left(s, char_length(s) - 2);
      result := array_append(result, root || 'ぐ');
    end if;
  end loop;
  foreach suffix in array array['した','して'] loop
    if right(s, 2) = suffix and char_length(s) > 2 then
      root := left(s, char_length(s) - 2);
      result := result || array[root || 'す', root || 'する'];
    end if;
  end loop;
  if char_length(s) > 1 and right(s, 1) in ('た','て') then
    result := array_append(result, left(s, char_length(s) - 1) || 'る');
  end if;

  -- Passive, causative and potential/conditional forms.
  foreach suffix in array array['られる','させる'] loop
    if right(s, char_length(suffix)) = suffix and char_length(s) > char_length(suffix) then
      root := left(s, char_length(s) - char_length(suffix));
      result := result || array[root || 'る', root || 'する'];
    end if;
  end loop;
  if right(s, 3) = 'される' and char_length(s) > 3 then
    result := array_append(result, left(s, char_length(s) - 3) || 'する');
  end if;
  foreach suffix in array array['れる','せる'] loop
    if right(s, char_length(suffix)) = suffix and char_length(s) > char_length(suffix) then
      stem := left(s, char_length(s) - char_length(suffix));
      last_char := right(stem, 1);
      prefix := left(stem, greatest(char_length(stem) - 1, 0));
      idx := array_position(a_from, last_char);
      if idx is not null then result := array_append(result, prefix || a_to[idx]); end if;
    end if;
  end loop;
  if right(s, 1) = 'る' and char_length(s) > 1 then
    stem := left(s, char_length(s) - 1);
    last_char := right(stem, 1);
    prefix := left(stem, greatest(char_length(stem) - 1, 0));
    idx := array_position(e_from, last_char);
    if idx is not null then result := array_append(result, prefix || e_to[idx]); end if;
  end if;
  if right(s, 2) = 'えば' and char_length(s) > 2 then
    stem := left(s, char_length(s) - 2);
    last_char := right(stem, 1);
    prefix := left(stem, greatest(char_length(stem) - 1, 0));
    idx := array_position(e_from, last_char);
    if idx is not null then result := array_append(result, prefix || e_to[idx]); end if;
  end if;
  if right(s, 2) = 'れば' and char_length(s) > 2 then
    result := array_append(result, left(s, char_length(s) - 2) || 'る');
  end if;

  return (
    select coalesce(array_agg(distinct value), '{}'::text[])
    from unnest(result) value
    where btrim(value) <> ''
  );
end
$$;

revoke all on function public.jmdict_dictionary_candidates(text) from public;
grant execute on function public.jmdict_dictionary_candidates(text) to service_role;

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
    select coalesce(array_agg(distinct candidate), '{}') as forms
    from unnest(coalesce(p_surfaces, '{}'::text[])) surface
    cross join lateral unnest(public.jmdict_dictionary_candidates(surface)) candidate
    where btrim(candidate) <> ''
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
    '{}'::text[] as search_forms,
    entry.common,
    entry.priority
  from public.jmdict_entries entry
  cross join requested
  where entry.dictionary_form = any(requested.forms)
     or entry.reading = any(requested.forms)
     or entry.aliases && requested.forms
  order by entry.common desc, entry.priority desc, entry.entry_seq, entry.entry_key
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.lookup_jmdict_vocabulary(text[], integer) from public;
grant execute on function public.lookup_jmdict_vocabulary(text[], integer) to service_role;

comment on table public.jmdict_entries is
  'Compact locally imported JMdict English vocabulary. Inflections are derived at lookup time instead of stored per row.';
comment on function public.lookup_jmdict_vocabulary(text[], integer) is
  'Derives likely dictionary forms from story surfaces, then returns compact JMdict rows for deterministic local verification.';
