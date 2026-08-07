# Row Level Security

Every public application table has RLS enabled.

## Learners

Learners can read/update their own profile-safe rows, preferences, settings, active sessions, answers, events, mastery, review data, custom requests, reports, and tickets. Completion, review result, achievement, and reward rows are readable by their owner but created through trusted database functions.

Only published, non-archived lessons and the current published version/children are publicly readable. Public feature flags require `public = true`.

## Owner-only administration

Production administration is restricted to one Supabase Auth user.

`public.admin_owner` is a singleton authorization record. Browser roles have no table privileges on it. The owner row is read only by security-definer authorization helpers.

When the owner-only migration is applied to an existing database, it seeds the owner automatically **only when exactly one active `admin` profile exists**. If there are zero or multiple active admins, it selects nobody and administrative authorization fails closed.

`current_app_role()` keeps normal authenticated role behavior but treats an `admin` profile as effective `admin` only when its Auth user ID matches `admin_owner.user_id`. A non-owner profile carrying the `admin` value is treated as a learner for database authorization.

`has_app_role()` grants operational RLS privileges only to the effective owner-admin. The legacy `content_editor` and `support` enum values remain for schema compatibility but receive no production staff privileges.

Both helpers are `security definer` functions with an empty fixed search path and fully qualified object references.

## Server authorization

Proxy checks are only the first filter. `/admin/*` resolves `current_app_role()` and admits only the effective `admin` owner.

Trusted route handlers independently call the server authorization layer before any service-role client is created or used. All operational permissions require the effective owner-admin role. Client-side Zustand state, profile strings, hidden navigation, or browser metadata never grant administrative access.

## Configuring the owner on a new database

On a fresh Supabase project, create your account first, then run this from the trusted SQL editor using your own email:

```sql
begin;

update public.profiles
set role = 'admin'
where email = 'YOUR_EMAIL'
  and status = 'active';

insert into public.admin_owner (singleton, user_id)
select true, id
from public.profiles
where email = 'YOUR_EMAIL'
  and role = 'admin'
  and status = 'active'
on conflict (singleton) do update
set user_id = excluded.user_id;

commit;
```

Verify the result with:

```sql
select p.id, p.email, p.role, p.status
from public.admin_owner o
join public.profiles p on p.id = o.user_id
where o.singleton = true;
```

Do not expose `admin_owner` through a client API or add browser RLS policies for it.

## Audit and storage

Normal authenticated users have no audit insert policy. Trusted server routes verify the actor then use the server-only administrative client.

Storage policies separate public lesson images, authenticated lesson audio, owner-admin uploads, and private per-user export paths.

Run `npm run db:validate` to verify table/RLS coverage, trusted functions, the reward constraint, owner-only administration, and absence of unrestricted authenticated `USING (true)` policies.
