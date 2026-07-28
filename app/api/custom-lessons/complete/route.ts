import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

type CompletionAction = "activities" | "audio";

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function completionAction(value: unknown): CompletionAction {
  return value === "audio" ? "audio" : "activities";
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const requestId = text(input.requestId);
  const action = completionAction(input.action);
  if (!requestId) {
    return NextResponse.json(
      { error: "A generation request is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient() as unknown as SupabaseClient;
  const found = await admin
    .from("progressive_lesson_drafts")
    .select("*")
    .eq("request_id", requestId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (found.error) {
    console.error("Custom lesson retry lookup failed.", {
      requestId,
      message: found.error.message,
    });
    return NextResponse.json(
      { error: "AIko could not load this lesson's progress." },
      { status: 500 },
    );
  }
  if (!found.data) {
    return NextResponse.json(
      { error: "The lesson generation request was not found." },
      { status: 404 },
    );
  }

  const row = found.data as Record<string, unknown>;
  const lessonId = text(row.lesson_id);
  const lessonVersionId = text(row.lesson_version_id);
  const assignmentId = text(row.assignment_id);
  const now = new Date().toISOString();

  if (action === "audio") {
    if (!lessonId || !lessonVersionId) {
      return NextResponse.json(
        { error: "The lesson must be ready before audio can be retried." },
        { status: 409 },
      );
    }
    const queued = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "audio_queued",
        current_stage: "audio",
        audio_status: "queued",
        audio_attempts: 0,
        audio_error: null,
        updated_at: now,
      })
      .eq("request_id", requestId)
      .eq("user_id", auth.userId);
    if (queued.error) {
      return NextResponse.json(
        { error: "Audio could not be queued." },
        { status: 500 },
      );
    }
  } else if (!lessonId) {
    const building = row.status === "activities_building" ||
      row.status === "activities_validating" ||
      row.status === "lesson_saving";
    if (!building) {
      const queued = await admin
        .from("progressive_lesson_drafts")
        .update({
          status: "activities_queued",
          current_stage: "activities_queued",
          build_attempts: row.status === "failed" ? 0 : row.build_attempts,
          failed_groups: [],
          last_error: null,
          worker_token: null,
          claimed_at: null,
          updated_at: now,
        })
        .eq("request_id", requestId)
        .eq("user_id", auth.userId);
      if (queued.error) {
        return NextResponse.json(
          { error: "The lesson could not be queued again." },
          { status: 500 },
        );
      }
    }
  }

  after(async () => {
    try {
      await processCustomLessonJobs({ requestId, maxCycles: 2 });
    } catch (error) {
      console.error("Custom lesson retry worker stopped.", {
        requestId,
        message: error instanceof Error ? error.message : "Unknown worker error.",
      });
    }
  });

  return NextResponse.json(
    {
      requestId,
      lesson_id: lessonId,
      lesson_version_id: lessonVersionId,
      assignment_id: assignmentId,
      status: lessonId ? "lesson_ready" : "activities_queued",
      queued: true,
    },
    { status: 202 },
  );
}
