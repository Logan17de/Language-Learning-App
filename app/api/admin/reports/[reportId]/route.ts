import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

const statuses = ["new", "investigating", "confirmed", "fixed", "rejected", "closed"];
const priorities = ["low", "medium", "high", "urgent"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ reportId: string }> },
) {
  const auth = await authorize("manage_support");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { reportId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid update." }, { status: 400 });
  }

  const status =
    "status" in body &&
    typeof body.status === "string" &&
    statuses.includes(body.status)
      ? body.status
      : undefined;
  const priority =
    "priority" in body &&
    typeof body.priority === "string" &&
    priorities.includes(body.priority)
      ? body.priority
      : undefined;
  const note =
    "note" in body && typeof body.note === "string"
      ? body.note.trim().slice(0, 2000)
      : "";

  if (!status && !priority && !note) {
    return NextResponse.json(
      { error: "No valid status, priority, or internal note was supplied." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const before = await admin
    .from("lesson_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  if (before.error) {
    return NextResponse.json({ error: before.error.message }, { status: 400 });
  }
  if (!before.data) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  let report = before.data;
  if (status || priority) {
    const updated = await admin
      .from("lesson_reports")
      .update({ status, priority })
      .eq("id", reportId)
      .select("*")
      .single();
    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 400 });
    }
    report = updated.data;
  }

  await writeAudit({
    actorUserId: auth.userId,
    action: note && !status && !priority ? "report.internal_note" : "report.status_changed",
    entityType: "lesson_report",
    entityId: reportId,
    before: before.data,
    after: report,
    metadata: note ? { note } : {},
  });

  return NextResponse.json(report);
}
