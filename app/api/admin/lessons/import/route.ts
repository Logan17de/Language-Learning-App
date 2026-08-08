import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { validateCompleteLessonBatch } from "@/lib/admin-complete-lesson-bulk-import";
import { processLessonTtsBatches } from "@/lib/audio/lesson-tts-batches";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await authorize("manage_content");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "A complete lesson package is required." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const lessons = Array.isArray(input.lessons)
    ? input.lessons
    : input.lesson
      ? [input.lesson]
      : [];
  const publish = input.publish === true;
  const validation = validateCompleteLessonBatch(lessons);
  if (!validation.valid) {
    return NextResponse.json(
      {
        error: "The lesson upload did not pass deterministic validation.",
        count: validation.count,
        validCount: validation.validCount,
        issues: validation.issues,
      },
      { status: 400 },
    );
  }

  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const rawClient = client as unknown as SupabaseClient;
  const { data, error } = await rawClient.rpc("import_complete_lessons", {
    p_packages: lessons as Json,
    p_publish: publish,
  });
  if (error) {
    console.error("Complete admin lesson bulk import failed.", {
      userId: auth.userId,
      lessonCount: lessons.length,
      code: error.code,
      message: error.message,
    });
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400 },
    );
  }

  // The DB trigger turns the oldest 100 pending imported lesson versions into
  // a threshold batch. This background call is therefore a no-op until the
  // threshold has actually been reached.
  after(async () => {
    try {
      await processLessonTtsBatches();
    } catch (workerError) {
      console.error("Automatic imported-lesson TTS worker stopped.", {
        userId: auth.userId,
        message: workerError instanceof Error ? workerError.message : "Unknown TTS worker error.",
      });
    }
  });

  return NextResponse.json({
    result: data,
    count: lessons.length,
    published: publish,
    modelApiUsed: false,
    tts: {
      queued: true,
      automaticBatchSize: 100,
      scope: "listening",
    },
  });
}
