import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";
import type { Database } from "@/types/database";

const plans: Database["public"]["Enums"]["subscription_plan"][] = ["free", "premium_monthly", "premium_annual"];
const statuses: Database["public"]["Enums"]["subscription_status"][] = ["active", "trial", "cancelled", "past_due"];

export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await authorize("manage_subscriptions");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { userId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("plan" in body) || !("status" in body)
    || typeof body.plan !== "string" || typeof body.status !== "string"
    || !plans.includes(body.plan as typeof plans[number]) || !statuses.includes(body.status as typeof statuses[number])) {
    return NextResponse.json({ error: "Invalid subscription state." }, { status: 400 });
  }
  const admin = createAdminClient();
  const before = await admin.from("user_subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (before.error) return NextResponse.json({ error: before.error.message }, { status: 400 });
  if (before.data?.billing_provider === "dodo") {
    return NextResponse.json(
      { error: "Dodo-managed subscriptions must be changed through the customer billing portal." },
      { status: 409 },
    );
  }
  const { data, error } = await admin.from("user_subscriptions").upsert({
    user_id: userId,
    plan: body.plan as typeof plans[number],
    status: body.status as typeof statuses[number],
    starts_at: new Date().toISOString(),
    mock_payment_status: "mocked",
    billing_provider: "manual",
    provider_customer_id: null,
    provider_subscription_id: null,
    provider_product_id: null,
    provider_status: null,
    cancel_at_period_end: false,
    last_provider_event_at: null,
  }, { onConflict: "user_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("profiles").update({ subscription_plan: body.plan as typeof plans[number] }).eq("id", userId);
  await writeAudit({ actorUserId: auth.userId, action: "subscription.changed", entityType: "subscription", entityId: userId, before: before.data, after: data });
  return NextResponse.json(data);
}
