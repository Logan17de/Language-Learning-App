import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ reportId: string }> }) {
  const auth = await authorize("manage_support");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { reportId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const status = typeof body === "object" && body !== null && "status" in body && typeof body.status === "string" ? body.status : null;
  const priority = typeof body === "object" && body !== null && "priority" in body && typeof body.priority === "string" ? body.priority : undefined;
  if (!status && !priority) return NextResponse.json({ error: "A status or priority is required." }, { status: 400 });
  const admin = createAdminClient();
  const before = await admin.from("lesson_reports").select("status,priority").eq("id", reportId).single();
  const { data, error } = await admin.from("lesson_reports").update({ status: status ?? undefined, priority }).eq("id", reportId).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit({ actorUserId: auth.userId, action: "report.status_changed", entityType: "lesson_report", entityId: reportId, before: before.data, after: data });
  return NextResponse.json(data);
}
