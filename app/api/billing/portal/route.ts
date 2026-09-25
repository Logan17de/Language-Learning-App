import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import {
  billingReturnUrl,
  createDodoClient,
  getDodoBillingConfig,
} from "@/lib/billing/dodo";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST() {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let config;
  try {
    config = getDodoBillingConfig();
  } catch {
    return NextResponse.json(
      { error: "Billing management is being configured." },
      { status: 503 },
    );
  }

  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  }
  const subscription = await client
    .from("user_subscriptions")
    .select("billing_provider,provider_customer_id")
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (subscription.error) {
    return NextResponse.json({ error: "Billing details could not be loaded." }, { status: 500 });
  }
  if (
    subscription.data?.billing_provider !== "dodo" ||
    !subscription.data.provider_customer_id
  ) {
    return NextResponse.json(
      { error: "This plan is managed by AIko support, not Dodo Payments." },
      { status: 409 },
    );
  }

  try {
    const portal = await createDodoClient(config).customers.customerPortal.create(
      subscription.data.provider_customer_id,
      { return_url: billingReturnUrl("portal") },
    );
    return NextResponse.json({ portalUrl: portal.link });
  } catch (error) {
    console.error("Dodo Payments portal creation failed.", {
      userId: auth.userId,
      message: error instanceof Error ? error.message : "Unknown portal error",
    });
    return NextResponse.json(
      { error: "Billing management could not be opened. Please try again." },
      { status: 502 },
    );
  }
}
