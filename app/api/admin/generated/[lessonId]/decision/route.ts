import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

const decisions = new Set(["approved", "rejected"]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ lessonId: string }> },
) {
  const auth = await authorize("manage_content");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const { lessonId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const decision =
    typeof body === "object" &&
    body !== null &&
    "decision" in body &&
    typeof body.decision === "string" &&
    decisions.has(body.decision)
      ? (body.decision as "approved" | "rejected")
      : null;
  const note =
    typeof body === "object" &&
    body !== null &&
    "note" in body &&
    typeof body.note === "string"
      ? body.note.trim().slice(0, 1000)
      : "";

  if (!decision) {
    return NextResponse.json(
      { error: "Decision must be approved or rejected." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const before = await admin
    .from("lessons")
    .select("id,status,title,current_version_id")
    .eq("id", lessonId)
    .maybeSingle();
  if (before.error) {
    return NextResponse.json({ error: before.error.message }, { status: 400 });
  }
  if (!before.data) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  const allowedFrom = new Set([
    "generated",
    "checking",
    "needs_review",
    "approved",
    "rejected",
  ]);
  if (!allowedFrom.has(before.data.status)) {
    return NextResponse.json(
      { error: `A ${before.data.status} lesson cannot be ${decision}.` },
      { status: 409 },
    );
  }

  const latestRun = await admin
    .from("lesson_validation_runs")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestRun.error) {
    return NextResponse.json({ error: latestRun.error.message }, { status: 400 });
  }

  let validation = latestRun.data;
  if (validation) {
    const updatedRun = await admin
      .from("lesson_validation_runs")
      .update({
        status: decision,
        validated_by: auth.userId,
        completed_at: new Date().toISOString(),
        warnings: note
          ? Array.from(new Set([...(validation.warnings ?? []), note]))
          : validation.warnings,
      })
      .eq("id", validation.id)
      .select("*")
      .single();
    if (updatedRun.error) {
      return NextResponse.json({ error: updatedRun.error.message }, { status: 400 });
    }
    validation = updatedRun.data;
  }

  const updatedLesson = await admin
    .from("lessons")
    .update({ status: decision })
    .eq("id", lessonId)
    .select("*")
    .single();
  if (updatedLesson.error) {
    return NextResponse.json({ error: updatedLesson.error.message }, { status: 400 });
  }

  await writeAudit({
    actorUserId: auth.userId,
    action: `generated_lesson.${decision}`,
    entityType: "lesson",
    entityId: lessonId,
    before: before.data,
    after: updatedLesson.data,
    metadata: note ? { note } : undefined,
  });

  return NextResponse.json({
    lesson: updatedLesson.data,
    validation,
  });
}
