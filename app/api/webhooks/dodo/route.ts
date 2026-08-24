import { NextResponse, type NextRequest } from "next/server";
import type { Subscription } from "dodopayments/resources/subscriptions";
import {
  billingPeriodForProduct,
  createDodoClient,
  getDodoBillingConfig,
} from "@/lib/billing/dodo";
import {
  asJson,
  deriveDodoSubscriptionState,
  DODO_SUBSCRIPTION_EVENTS,
  dodoMetadataValue,
} from "@/lib/billing/dodo-subscription";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const webhookId = request.headers.get("webhook-id")?.trim() ?? "";
  const signature = request.headers.get("webhook-signature")?.trim() ?? "";
  const timestamp = request.headers.get("webhook-timestamp")?.trim() ?? "";
  const rawBody = await request.text();
  if (!webhookId || !signature || !timestamp || !rawBody) {
    return NextResponse.json({ error: "Missing webhook signature." }, { status: 400 });
  }

  let config;
  try {
    config = getDodoBillingConfig();
  } catch {
    return NextResponse.json({ error: "Billing webhook is not configured." }, { status: 503 });
  }

  let payload;
  try {
    payload = createDodoClient(config).webhooks.unwrap(rawBody, {
      headers: {
        "webhook-id": webhookId,
        "webhook-signature": signature,
        "webhook-timestamp": timestamp,
      },
    });
  } catch (error) {
    console.warn("Rejected invalid Dodo Payments webhook signature.", {
      webhookId,
      message: error instanceof Error ? error.message : "Invalid signature",
    });
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  if (!DODO_SUBSCRIPTION_EVENTS.has(payload.type)) {
    return NextResponse.json({ received: true, ignored: true });
  }

  const subscription = payload.data as Subscription;
  const billingPeriod = billingPeriodForProduct(subscription.product_id, config);
  if (!billingPeriod) {
    console.info("Ignored Dodo subscription for an unrelated product.", {
      webhookId,
      productId: subscription.product_id,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const admin = createAdminClient();
  const existingBySubscription = await admin
    .from("user_subscriptions")
    .select("user_id")
    .eq("provider_subscription_id", subscription.subscription_id)
    .maybeSingle();
  if (existingBySubscription.error) {
    return NextResponse.json({ error: "Billing state lookup failed." }, { status: 500 });
  }
  let userId = existingBySubscription.data?.user_id ?? null;
  if (!userId) {
    const existingByCustomer = await admin
      .from("user_subscriptions")
      .select("user_id")
      .eq("provider_customer_id", subscription.customer.customer_id)
      .maybeSingle();
    if (existingByCustomer.error) {
      return NextResponse.json({ error: "Billing customer lookup failed." }, { status: 500 });
    }
    userId = existingByCustomer.data?.user_id ?? null;
  }
  if (!userId) {
    const metadataUserId = dodoMetadataValue(subscription.metadata, "aiko_user_id");
    userId = metadataUserId && UUID_PATTERN.test(metadataUserId) ? metadataUserId : null;
  }
  if (!userId) {
    console.warn("Ignored Dodo subscription without an AIko user id.", {
      webhookId,
      subscriptionId: subscription.subscription_id,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const state = deriveDodoSubscriptionState(subscription, billingPeriod);
  const applied = await admin.rpc("apply_dodo_subscription_event", {
    p_webhook_id: webhookId,
    p_event_type: payload.type,
    p_event_at: payload.timestamp,
    p_payload: asJson(payload),
    p_user_id: userId,
    p_plan: state.plan,
    p_status: state.status,
    p_billing_interval: state.billingInterval,
    p_provider_customer_id: subscription.customer.customer_id,
    p_provider_subscription_id: subscription.subscription_id,
    p_provider_product_id: subscription.product_id,
    p_provider_status: subscription.status,
    p_starts_at: state.startsAt,
    p_renews_at: state.renewsAt,
    p_cancelled_at: state.cancelledAt,
    p_cancel_at_period_end: subscription.cancel_at_next_billing_date,
    p_entitled: state.entitled,
  });
  if (applied.error) {
    console.error("Dodo Payments webhook could not update AIko billing.", {
      webhookId,
      eventType: payload.type,
      userId,
      message: applied.error.message,
    });
    return NextResponse.json({ error: "Billing update failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
