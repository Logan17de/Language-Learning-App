import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Subscription } from "dodopayments/resources/subscriptions";
import type { Product } from "dodopayments/resources/products/products";
import {
  assertTenDollarMonthlyProduct,
  deriveDodoSubscriptionState,
} from "@/lib/billing/dodo-subscription";

const checkoutRoute = readFileSync("app/api/billing/checkout/route.ts", "utf8");
const webhookRoute = readFileSync("app/api/webhooks/dodo/route.ts", "utf8");
const subscriptionPage = readFileSync("components/subscription/subscription-page.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260824043155_dodo_payments_billing.sql",
  "utf8",
);

function subscription(status: Subscription["status"]): Subscription {
  return {
    status,
    created_at: "2026-08-01T00:00:00.000Z",
    previous_billing_date: "2026-08-01T00:00:00.000Z",
    next_billing_date: "2026-09-01T00:00:00.000Z",
    cancelled_at: status === "cancelled" ? "2026-08-20T00:00:00.000Z" : null,
  } as Subscription;
}

describe("Dodo Payments subscription state", () => {
  it("requires the checkout product to be recurring $10 USD per month", () => {
    const product = {
      is_recurring: true,
      price: {
        type: "recurring_price",
        currency: "USD",
        price: 1_000,
        payment_frequency_count: 1,
        payment_frequency_interval: "Month",
      },
    } as unknown as Product;
    expect(() => assertTenDollarMonthlyProduct(product)).not.toThrow();
    expect(() => assertTenDollarMonthlyProduct({
      ...product,
      price: { ...product.price, price: 1_500 },
    } as Product)).toThrow("$10 USD monthly product");
  });

  it("grants the matching premium entitlement only for an active subscription", () => {
    expect(deriveDodoSubscriptionState(subscription("active"), "monthly")).toMatchObject({
      plan: "premium_monthly",
      status: "active",
      entitled: true,
    });
    expect(deriveDodoSubscriptionState(subscription("active"), "annual")).toMatchObject({
      plan: "premium_annual",
      billingInterval: "annual",
      entitled: true,
    });
  });

  it("removes the app entitlement for held, paused, cancelled, failed, or expired states", () => {
    expect(deriveDodoSubscriptionState(subscription("on_hold"), "monthly")).toMatchObject({
      status: "past_due",
      entitled: false,
    });
    for (const status of ["paused", "cancelled", "failed", "expired"] as const) {
      expect(deriveDodoSubscriptionState(subscription(status), "monthly").entitled).toBe(false);
    }
  });
});

describe("Dodo Payments server boundary", () => {
  it("selects product ids and customer identity on the authenticated server", () => {
    expect(checkoutRoute).toContain('authorize("learn")');
    expect(checkoutRoute).toContain("dodoProductId(period, config)");
    expect(checkoutRoute).toContain("assertTenDollarMonthlyProduct(product)");
    expect(checkoutRoute).toContain("identity.data.user.email");
    expect(checkoutRoute).not.toContain("record?.productId");
    expect(checkoutRoute).not.toContain("record?.email");
  });

  it("verifies signed webhooks and applies them through the idempotent billing RPC", () => {
    expect(webhookRoute).toContain("webhooks.unwrap(rawBody");
    expect(webhookRoute).toContain('request.headers.get("webhook-signature")');
    expect(webhookRoute).toContain('admin.rpc("apply_dodo_subscription_event"');
    expect(migration).toContain("on conflict (webhook_id) do nothing");
    expect(migration).toContain("alter table public.billing_webhook_events enable row level security");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("replaces the mock checkout notice with hosted checkout and billing management", () => {
    expect(subscriptionPage).toContain("<CheckoutButton");
    expect(subscriptionPage).toContain("<ManageBillingButton");
    expect(subscriptionPage).not.toContain("Premium checkout is coming soon");
    expect(subscriptionPage).not.toContain("Billing checkout is not connected yet");
    expect(subscriptionPage).toContain('$10 USD');
    expect(subscriptionPage).toContain('billingPeriod="monthly"');
  });
});
