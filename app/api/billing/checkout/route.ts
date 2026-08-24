import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import {
  billingReturnUrl,
  createDodoClient,
  dodoProductId,
  getDodoBillingConfig,
} from "@/lib/billing/dodo";
import { createClient } from "@/lib/supabase/server";
import type { BillingPeriod } from "@/types/app-preferences";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const input: unknown = await request.json().catch(() => null);
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  const billingPeriod = record?.billingPeriod;
  if (billingPeriod !== "monthly" && billingPeriod !== "annual") {
    return NextResponse.json({ error: "Choose monthly or annual billing." }, { status: 400 });
  }
  const checkoutAttempt =
    typeof record?.checkoutAttempt === "string" &&
    UUID_PATTERN.test(record.checkoutAttempt)
      ? record.checkoutAttempt
      : randomUUID();

  let config;
  try {
    config = getDodoBillingConfig();
  } catch (error) {
    console.error("Dodo Payments checkout is not configured.", {
      message: error instanceof Error ? error.message : "Unknown configuration error",
    });
    return NextResponse.json(
      { error: "Premium checkout is being configured. Please try again later." },
      { status: 503 },
    );
  }

  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  }
  const [identity, profile, subscription] = await Promise.all([
    client.auth.getUser(),
    client.from("profiles").select("display_name,subscription_plan").eq("id", auth.userId).single(),
    client
      .from("user_subscriptions")
      .select("plan,status,billing_provider,provider_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle(),
  ]);
  if (identity.error || !identity.data.user?.email || profile.error || subscription.error) {
    return NextResponse.json(
      { error: "Your billing profile could not be prepared." },
      { status: 500 },
    );
  }
  if (
    (profile.data.subscription_plan !== "free" || subscription.data?.plan !== "free") &&
    subscription.data &&
    ["active", "trial"].includes(subscription.data.status)
  ) {
    return NextResponse.json(
      { error: "Premium is already active. Use Manage billing instead." },
      { status: 409 },
    );
  }

  const period = billingPeriod as BillingPeriod;
  const customer = subscription.data?.provider_customer_id
    ? { customer_id: subscription.data.provider_customer_id }
    : {
        email: identity.data.user.email,
        name: profile.data.display_name || identity.data.user.email.split("@")[0],
      };

  try {
    const checkout = await createDodoClient(config).checkoutSessions.create(
      {
        product_cart: [{ product_id: dodoProductId(period, config), quantity: 1 }],
        customer,
        metadata: {
          aiko_user_id: auth.userId,
          aiko_billing_period: period,
        },
        return_url: billingReturnUrl("success"),
        cancel_url: billingReturnUrl("cancelled"),
        customization: { theme: "light" },
        feature_flags: {
          allow_customer_editing_email: false,
          allow_customer_editing_name: true,
          allow_discount_code: true,
          redirect_immediately: true,
        },
        show_saved_payment_methods: true,
      },
      { idempotencyKey: `aiko-${auth.userId}-${checkoutAttempt}` },
    );
    if (!checkout.checkout_url) {
      throw new Error("Dodo Payments did not return a checkout URL.");
    }
    return NextResponse.json({ checkoutUrl: checkout.checkout_url });
  } catch (error) {
    console.error("Dodo Payments checkout creation failed.", {
      userId: auth.userId,
      billingPeriod,
      message: error instanceof Error ? error.message : "Unknown checkout error",
    });
    return NextResponse.json(
      { error: "Checkout could not be opened. Please try again." },
      { status: 502 },
    );
  }
}
