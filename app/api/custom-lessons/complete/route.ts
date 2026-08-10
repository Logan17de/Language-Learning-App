import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const requestId = text(input.requestId);
  const action = input.action === "audio" ? "audio" : "activities";
  if (!requestId) return NextResponse.json({ error: "A generation request is required." }, { status: 400 });

  const admin = createAdminClient() as unknown as SupabaseClient;
  const found = await admin
    .from("progressive_lesson_drafts")
    .select("request_id,status,lesson_id,lesson_version_id,assignment_id,audio_status,stage_attempts")
    .eq("request_id", requestId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (found.error) return NextResponse.json({ error: "AIko could not load this lesson's progress." }, { status: 500 });
  if (!found.data) return NextResponse.json({ error: "The lesson generation request was not found." }, { status: 404 });
  const row = found.data as unknown as Record<string, unknown>;

  if (action === "audio") {
    if (!text(row.lesson_version_id)) {
      return NextResponse.json({ error: "The lesson must be ready before audio can be retried." }, { status: 409 });
    }
    const attempts = row.stage_attempts && typeof row.stage_attempts === "object" && !Array.isArray(row.stage_attempts)
      ? { ...row.stage_attempts as Record<string, unknown>, audio: 0 }
      : { audio: 0 };
    const queued = await admin.from("progressive_lesson_drafts").update({
      status: "audio",
      current_stage: "audio",
      audio_status: "queued",
      audio_error: null,
      stage_attempts: attempts,
      next_attempt_at: new Date().toISOString(),
      worker_token: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    }).eq("request_id", requestId).eq("user_id", auth.userId);
    if (queued.error) return NextResponse.json({ error: "Audio could not be queued." }, { status: 500 });
  } else if (row.status === "permanent_failure") {
    return NextResponse.json(
      { error: "This failure needs a configuration, authorization, catalog, or new-request correction; it cannot be retried unchanged." },
      { status: 409 },
    );
  }

  // Retryable lesson work is already due for the protected scheduler. This
  // endpoint is only an optional immediate nudge, not the durable queue.
  after(async () => {
    const startedAt = Date.now();
    try {
      await processCustomLessonJobs({ requestId, maxCycles: 1 });
    } catch (error) {
      console.error("Custom lesson retry nudge stopped; the scheduler will resume it.", {
        requestId,
        stage: action,
        attempt: 1,
        errorClassification: "transient",
        providerRequestId: null,
        durationMs: Date.now() - startedAt,
        action: "resumed",
        message: error instanceof Error ? error.message : "Unknown worker error.",
      });
    }
  });
  return NextResponse.json({
    requestId,
    lesson_id: text(row.lesson_id),
    lesson_version_id: text(row.lesson_version_id),
    assignment_id: text(row.assignment_id),
    status: action === "audio" ? "audio" : row.status,
    queued: true,
  }, { status: 202 });
}
