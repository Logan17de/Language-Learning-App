import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

const statuses = new Set(["operational", "degraded", "offline", "maintenance"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ serviceId: string }> },
) {
  const auth = await authorize("write_audit");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { serviceId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const status = typeof body === "object" && body !== null && "status" in body && typeof body.status === "string" && statuses.has(body.status) ? body.status : null;
  const detail = typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string" ? body.detail.trim().slice(0, 1000) : undefined;
  if (!status) return NextResponse.json({ error: "Invalid service status." }, { status: 400 });

  const admin = createAdminClient();
  const before = await admin.from("service_status").select("*").eq("id", serviceId).maybeSingle();
  if (before.error) return NextResponse.json({ error: before.error.message }, { status: 400 });
  if (!before.data) return NextResponse.json({ error: "Service status record not found." }, { status: 404 });
  const updated = await admin.from("service_status").update({ status, detail }).eq("id", serviceId).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 });
  await writeAudit({ actorUserId: auth.userId, action: "service_status.updated", entityType: "service_status", entityId: serviceId, before: before.data, after: updated.data });
  return NextResponse.json(updated.data);
}
