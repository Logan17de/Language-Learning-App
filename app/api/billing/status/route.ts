import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const client = await createClient();
  if (!client) {
    return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  }
  const [profile, subscription] = await Promise.all([
    client.from("profiles").select("subscription_plan").eq("id", auth.userId).single(),
    client
      .from("user_subscriptions")
      .select("status,billing_interval,renews_at,cancel_at_period_end,billing_provider,provider_customer_id,provider_status")
      .eq("user_id", auth.userId)
      .maybeSingle(),
  ]);
  if (profile.error || subscription.error) {
    return NextResponse.json({ error: "Subscription status could not be loaded." }, { status: 500 });
  }
  const premium = profile.data.subscription_plan !== "free";
  return NextResponse.json({
    plan: premium ? "premium" : "free",
    billingPeriod:
      subscription.data?.billing_interval === "annual" ? "annual" : "monthly",
    status: subscription.data?.status ?? "active",
    renewsAt: subscription.data?.renews_at ?? null,
    cancelAtPeriodEnd: subscription.data?.cancel_at_period_end ?? false,
    billingProvider: subscription.data?.billing_provider ?? "manual",
    providerStatus: subscription.data?.provider_status ?? null,
    manageAvailable:
      subscription.data?.billing_provider === "dodo" &&
      Boolean(subscription.data.provider_customer_id),
  });
}
