-- Repair Auth users created before the AIko profile trigger was installed.
-- This migration is intentionally idempotent so it is safe for existing accounts.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, timezone)
  values (
    new.id,
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Learner'
      ),
      80
    ),
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'timezone'), ''), 'UTC')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_subscriptions (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

insert into public.profiles (id, display_name, email, timezone)
select
  user_record.id,
  left(
    coalesce(
      nullif(trim(user_record.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(user_record.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(user_record.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(user_record.email, ''), '@', 1), ''),
      'Learner'
    ),
    80
  ),
  coalesce(user_record.email, ''),
  coalesce(
    nullif(trim(user_record.raw_user_meta_data ->> 'timezone'), ''),
    'UTC'
  )
from auth.users as user_record
on conflict (id) do nothing;

insert into public.user_preferences (user_id)
select profile.id
from public.profiles as profile
on conflict (user_id) do nothing;

insert into public.user_settings (user_id)
select profile.id
from public.profiles as profile
on conflict (user_id) do nothing;

insert into public.user_subscriptions (user_id)
select profile.id
from public.profiles as profile
on conflict (user_id) do nothing;
