import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest, context: { params: Promise<{ lessonId: string }> }) {
  const auth = await authorize("publish_lessons");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { lessonId } = await context.params;
  const body: unknown = await request.json().catch(() => ({}));
  const summary = typeof body === "object" && body !== null && "changeSummary" in body && typeof body.changeSummary === "string"
    ? body.changeSummary : "Published from the AIko admin workspace";
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data, error } = await client.rpc("publish_lesson_version", { p_lesson_id: lessonId, p_change_summary: summary });
  if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.json(data);
}
