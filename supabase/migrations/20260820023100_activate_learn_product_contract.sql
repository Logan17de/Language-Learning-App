-- Final activation switch for the /learn product contract.
--
-- The compatible frontend treats a genuinely missing RPC as the legacy rollout
-- state. That keeps every intermediate database state usable if 021500 or
-- 023000 succeeds but a later migration fails. This migration changes no data
-- and flips the UI/API contract only after all prerequisite DB behavior exists.

create or replace function public.learn_product_contract_version()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select '20260820023100'::text
$$;

revoke all on function public.learn_product_contract_version()
  from public, anon;
grant execute on function public.learn_product_contract_version()
  to authenticated, service_role;

comment on function public.learn_product_contract_version() is
  'Activation sentinel for the Premium Translation and canonical /learn product contract.';

do $$
begin
  if not has_function_privilege(
    'authenticated',
    'public.learn_product_contract_version()',
    'EXECUTE'
  ) then
    raise exception 'Learn product contract activation RPC is not executable by authenticated';
  end if;
end;
$$;
