-- AIko production administration is intentionally owner-only.
-- The singleton row is seeded only when exactly one active admin already exists.
-- If the database has zero or multiple active admins, no owner is selected and
-- all administrative authorization fails closed until an owner is set manually.

create table public.admin_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.admin_owner enable row level security;
revoke all on table public.admin_owner from anon, authenticated;

comment on table public.admin_owner is
  'Singleton production admin owner. Not exposed to browser roles; read only by security-definer authorization functions.';

insert into public.admin_owner (singleton, user_id)
select true, p.id
from public.profiles p
where p.role = 'admin'::public.app_role
  and p.status = 'active'::public.account_status
  and (
    select count(*)
    from public.profiles candidate
    where candidate.role = 'admin'::public.app_role
      and candidate.status = 'active'::public.account_status
  ) = 1;

-- Harden the existing helper with an empty search path and make the admin role
-- effective only for the singleton owner. Other authenticated roles keep their
-- ordinary identity for learner-safe policies, but they do not become admins.
create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select case
    when p.role = 'admin'::public.app_role
      and exists (
        select 1
        from public.admin_owner owner_row
        where owner_row.singleton = true
          and owner_row.user_id = p.id
      )
      then 'admin'::public.app_role
    when p.role = 'admin'::public.app_role
      then 'learner'::public.app_role
    else p.role
  end
  from public.profiles p
  where p.id = (select auth.uid())
    and p.status = 'active'::public.account_status
$$;

-- Operational RLS is owner-only. Existing policies can keep calling
-- has_app_role(...); content_editor/support no longer receive staff privileges.
create or replace function public.has_app_role(allowed public.app_role[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    case public.current_app_role()
      when 'admin'::public.app_role then 'admin'::public.app_role = any(allowed)
      when 'learner'::public.app_role then 'learner'::public.app_role = any(allowed)
      else false
    end,
    false
  )
$$;

revoke all on function public.current_app_role() from public;
revoke all on function public.has_app_role(public.app_role[]) from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_app_role(public.app_role[]) to authenticated;
