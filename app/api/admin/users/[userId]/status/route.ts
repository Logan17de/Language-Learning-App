import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";
import type { Database } from "@/types/database";

const statuses: Database["public"]["Enums"]["account_status"][] = ["active", "suspended", "deleted"];

export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const auth = await authorize("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { userId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const status = typeof body === "object" && body !== null && "status" in body ? body.status : null;
  if (typeof status !== "string" || !statuses.includes(status as typeof statuses[number])) {
    return NextResponse.json({ error: "Invalid account status." }, { status: 400 });
  }
  const admin = createAdminClient();
  const before = await admin.from("profiles").select("status").eq("id", userId).single();
  const { data, error } = await admin.from("profiles").update({ status: status as typeof statuses[number] }).eq("id", userId).select("id,status").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit({ actorUserId: auth.userId, action: "user.status_changed", entityType: "profile", entityId: userId, before: before.data, after: data });
  return NextResponse.json(data);
}
