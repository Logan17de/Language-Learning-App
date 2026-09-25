-- Replace the mock-only subscription fields with provider-backed Dodo billing
-- while keeping administrator-assigned beta access working.

alter table public.user_subscriptions
  add column if not exists billing_provider text not null default 'manual'
    check (billing_provider in ('manual', 'dodo')),
  add column if not exists provider_customer_id text,
  add column if not exists provider_subscription_id text,
  add column if not exists provider_product_id text,
  add column if not exists provider_status text,
  add column if not exists cancel_at_period_end boolean not null default false,
  add column if not exists last_provider_event_at timestamptz;

alter table public.user_subscriptions
  drop constraint if exists user_subscriptions_mock_payment_status_check;

alter table public.user_subscriptions
  add constraint user_subscriptions_mock_payment_status_check
  check (mock_payment_status in ('paid', 'trial', 'failed', 'mocked', 'not_applicable'));

create unique index if not exists user_subscriptions_provider_subscription_unique
  on public.user_subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

create unique index if not exists user_subscriptions_provider_customer_unique
  on public.user_subscriptions(provider_customer_id)
  where provider_customer_id is not null;

create table if not exists public.billing_webhook_events (
  webhook_id text primary key,
  provider text not null default 'dodo' check (provider = 'dodo'),
  event_type text not null,
  event_at timestamptz not null,
  user_id uuid references public.profiles(id) on delete set null,
  provider_subscription_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  processed_at timestamptz not null default now()
);

alter table public.billing_webhook_events enable row level security;

revoke all on table public.billing_webhook_events from public, anon, authenticated;
grant all on table public.billing_webhook_events to service_role;

-- Existing projects may no longer expose new or altered public tables through
-- the Data API by default. Learners only need their own subscription read,
-- which remains protected by the existing subscriptions_own_read RLS policy.
grant select on table public.user_subscriptions to authenticated;
grant all on table public.user_subscriptions to service_role;

create or replace function public.apply_dodo_subscription_event(
  p_webhook_id text,
  p_event_type text,
  p_event_at timestamptz,
  p_payload jsonb,
  p_user_id uuid,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_billing_interval text,
  p_provider_customer_id text,
  p_provider_subscription_id text,
  p_provider_product_id text,
  p_provider_status text,
  p_starts_at timestamptz,
  p_renews_at timestamptz,
  p_cancelled_at timestamptz,
  p_cancel_at_period_end boolean,
  p_entitled boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_last_event_at timestamptz;
begin
  if p_webhook_id is null or btrim(p_webhook_id) = '' then
    raise exception 'Webhook id is required' using errcode = '22023';
  end if;
  if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'AIko billing user was not found' using errcode = '22023';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'Unsupported billing interval' using errcode = '22023';
  end if;

  insert into public.billing_webhook_events (
    webhook_id, event_type, event_at, user_id, provider_subscription_id, payload
  ) values (
    p_webhook_id, p_event_type, p_event_at, p_user_id,
    p_provider_subscription_id, p_payload
  )
  on conflict (webhook_id) do nothing;

  if not found then
    return jsonb_build_object('duplicate', true, 'applied', false);
  end if;

  select last_provider_event_at
  into v_last_event_at
  from public.user_subscriptions
  where user_id = p_user_id
  for update;

  if v_last_event_at is not null and p_event_at < v_last_event_at then
    return jsonb_build_object('duplicate', false, 'applied', false, 'stale', true);
  end if;

  insert into public.user_subscriptions (
    user_id,
    plan,
    status,
    billing_interval,
    starts_at,
    renews_at,
    cancelled_at,
    mock_payment_status,
    billing_provider,
    provider_customer_id,
    provider_subscription_id,
    provider_product_id,
    provider_status,
    cancel_at_period_end,
    last_provider_event_at
  ) values (
    p_user_id,
    p_plan,
    p_status,
    p_billing_interval,
    coalesce(p_starts_at, p_event_at),
    p_renews_at,
    p_cancelled_at,
    'not_applicable',
    'dodo',
    p_provider_customer_id,
    p_provider_subscription_id,
    p_provider_product_id,
    p_provider_status,
    coalesce(p_cancel_at_period_end, false),
    p_event_at
  )
  on conflict (user_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    billing_interval = excluded.billing_interval,
    starts_at = excluded.starts_at,
    renews_at = excluded.renews_at,
    cancelled_at = excluded.cancelled_at,
    mock_payment_status = excluded.mock_payment_status,
    billing_provider = excluded.billing_provider,
    provider_customer_id = excluded.provider_customer_id,
    provider_subscription_id = excluded.provider_subscription_id,
    provider_product_id = excluded.provider_product_id,
    provider_status = excluded.provider_status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    last_provider_event_at = excluded.last_provider_event_at,
    updated_at = now();

  update public.profiles
  set subscription_plan = case when p_entitled then p_plan else 'free'::public.subscription_plan end,
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('duplicate', false, 'applied', true);
end;
$$;

revoke all on function public.apply_dodo_subscription_event(
  text, text, timestamptz, jsonb, uuid, public.subscription_plan,
  public.subscription_status, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, boolean, boolean
) from public, anon, authenticated;

grant execute on function public.apply_dodo_subscription_event(
  text, text, timestamptz, jsonb, uuid, public.subscription_plan,
  public.subscription_status, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, boolean, boolean
) to service_role;
