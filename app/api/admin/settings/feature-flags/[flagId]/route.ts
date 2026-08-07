import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/server/audit-service";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ flagId: string }> },
) {
  const auth = await authorize("write_audit");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { flagId } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const enabled = typeof body === "object" && body !== null && "enabled" in body && typeof body.enabled === "boolean" ? body.enabled : null;
  if (enabled === null) return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });

  const admin = createAdminClient();
  const before = await admin.from("feature_flags").select("*").eq("id", flagId).maybeSingle();
  if (before.error) return NextResponse.json({ error: before.error.message }, { status: 400 });
  if (!before.data) return NextResponse.json({ error: "Feature flag not found." }, { status: 404 });
  const updated = await admin.from("feature_flags").update({ enabled }).eq("id", flagId).select("*").single();
  if (updated.error) return NextResponse.json({ error: updated.error.message }, { status: 400 });
  await writeAudit({ actorUserId: auth.userId, action: "feature_flag.updated", entityType: "feature_flag", entityId: flagId, before: before.data, after: updated.data });
  return NextResponse.json(updated.data);
}
