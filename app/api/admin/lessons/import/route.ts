import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { validateCompleteLessonImport } from "@/lib/admin-complete-lesson-import";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A complete lesson package is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const lesson = input.lesson;
  const publish = input.publish === true;
  const validation = validateCompleteLessonImport(lesson);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "The lesson package did not pass deterministic validation.",
        errors: validation.errors,
        counts: validation.counts,
      },
      { status: 400 },
    );
  }

  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data, error } = await client.rpc("import_complete_lesson", {
    p_package: lesson as Json,
    p_publish: publish,
  });
  if (error) {
    console.error("Complete admin lesson import failed.", {
      userId: auth.userId,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400 },
    );
  }
  return NextResponse.json({ result: data, counts: validation.counts, modelApiUsed: false });
}
