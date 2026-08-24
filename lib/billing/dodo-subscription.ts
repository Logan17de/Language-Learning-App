import type { Subscription } from "dodopayments/resources/subscriptions";
import type { Database, Json } from "@/types/database";
import type { BillingPeriod } from "@/types/app-preferences";

export const DODO_SUBSCRIPTION_EVENTS = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.on_hold",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.renewed",
  "subscription.plan_changed",
  "subscription.update_payment_method",
  "subscription.cancelled",
  "subscription.failed",
  "subscription.expired",
]);

export interface DodoSubscriptionState {
  plan: "premium_monthly" | "premium_annual";
  status: Database["public"]["Enums"]["subscription_status"];
  billingInterval: BillingPeriod;
  entitled: boolean;
  startsAt: string;
  renewsAt: string | null;
  cancelledAt: string | null;
}

export function dodoMetadataValue(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function deriveDodoSubscriptionState(
  subscription: Subscription,
  billingInterval: BillingPeriod,
): DodoSubscriptionState {
  const plan = billingInterval === "annual" ? "premium_annual" : "premium_monthly";
  const active = subscription.status === "active";
  const status: DodoSubscriptionState["status"] = active
    ? "active"
    : subscription.status === "on_hold"
      ? "past_due"
      : "cancelled";
  return {
    plan,
    status,
    billingInterval,
    entitled: active,
    startsAt: subscription.previous_billing_date || subscription.created_at,
    renewsAt:
      subscription.next_billing_date && subscription.status !== "expired"
        ? subscription.next_billing_date
        : null,
    cancelledAt:
      subscription.cancelled_at ??
      (["cancelled", "failed", "expired"].includes(subscription.status)
        ? new Date().toISOString()
        : null),
  };
}

export function asJson(value: unknown): Json {
  return value as Json;
}
