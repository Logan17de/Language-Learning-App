-- Learn semantically equivalent grammar spellings/forms without changing the
-- canonical JLPT catalog pattern. Library enrichment can canonicalize a known
-- alias immediately and avoids another AI adjudication on future appearances.

alter table public.grammar_catalog
  add column if not exists accepted_patterns text[] not null default '{}';

create or replace function public.learn_grammar_pattern_alias(
  p_canonical_pattern text,
  p_alias text,
  p_confidence numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if nullif(btrim(p_canonical_pattern), '') is null
     or nullif(btrim(p_alias), '') is null
     or p_confidence < 0.95 then
    return false;
  end if;

  update public.grammar_catalog
  set accepted_patterns = array(
        select distinct learned_pattern
        from unnest(
          coalesce(accepted_patterns, '{}') || array[btrim(p_alias)]
        ) learned_pattern
        where nullif(btrim(learned_pattern), '') is not null
        order by learned_pattern
      ),
      updated_at = now()
  where pattern = p_canonical_pattern
    and active = true;

  v_updated := found;
  return v_updated;
end
$$;

revoke all on function public.learn_grammar_pattern_alias(text, text, numeric) from public;
grant execute on function public.learn_grammar_pattern_alias(text, text, numeric) to service_role;

comment on column public.grammar_catalog.accepted_patterns is
  'AI-confirmed alternate forms that canonicalize to this grammar pattern.';

comment on function public.learn_grammar_pattern_alias(text, text, numeric) is
  'Atomically stores a high-confidence grammar alias under its canonical catalog pattern.';
