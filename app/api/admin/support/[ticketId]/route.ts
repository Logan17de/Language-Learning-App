import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

const statuses = ["new", "open", "waiting_for_user", "resolved", "closed"];
const priorities = ["low", "medium", "high", "urgent"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ ticketId: string }> }) {
  const auth = await authorize("manage_support");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { ticketId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  const status = "status" in body && typeof body.status === "string" && statuses.includes(body.status) ? body.status : undefined;
  const priority = "priority" in body && typeof body.priority === "string" && priorities.includes(body.priority) ? body.priority : undefined;
  if (!status && !priority) return NextResponse.json({ error: "No valid changes supplied." }, { status: 400 });
  const admin = createAdminClient();
  const before = await admin.from("support_tickets").select("status,priority").eq("id", ticketId).single();
  const { data, error } = await admin.from("support_tickets").update({ status, priority }).eq("id", ticketId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit({ actorUserId: auth.userId, action: "support.status_changed", entityType: "support_ticket", entityId: ticketId, before: before.data, after: data });
  return NextResponse.json(data);
}
