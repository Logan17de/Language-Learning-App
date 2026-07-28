import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { buildInteractiveStory } from "@/lib/gemini/lesson-activity-groups";
import type {
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) return response({ error: auth.message }, auth.status);

  const requestId = request.nextUrl.searchParams.get("requestId")?.trim() ?? "";
  if (!UUID.test(requestId)) {
    return response({ error: "A valid generation request is required." }, 400);
  }

  const admin = createAdminClient() as unknown as SupabaseClient;
  const found = await admin
    .from("progressive_lesson_drafts")
    .select([
      "request_id",
      "user_id",
      "status",
      "current_stage",
      "progress_percent",
      "story_draft",
      "library_snapshot",
      "completed_groups",
      "failed_groups",
      "build_attempts",
      "lesson_id",
      "lesson_version_id",
      "assignment_id",
      "audio_status",
      "audio_attempts",
    ].join(","))
    .eq("request_id", requestId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (found.error) {
    console.error("Custom lesson status lookup failed.", {
      requestId,
      message: found.error.message,
    });
    return response({ error: "AIko could not load this lesson's progress." }, 500);
  }
  if (!found.data) {
    return response({ error: "The lesson generation request was not found." }, 404);
  }

  const row = found.data as Record<string, unknown>;
  let story: ReturnType<typeof buildInteractiveStory> | null = null;
  try {
    story = buildInteractiveStory(
      row.story_draft as StoryDraft,
      row.library_snapshot as ResolvedLessonLibrary,
    );
  } catch (error) {
    console.error("Stored custom lesson story could not be restored.", {
      requestId,
      message: error instanceof Error ? error.message : "Invalid story checkpoint.",
    });
  }

  const status = typeof row.status === "string" ? row.status : "failed";
  const buildAttempts = typeof row.build_attempts === "number" ? row.build_attempts : 0;
  const audioAttempts = typeof row.audio_attempts === "number" ? row.audio_attempts : 0;
  const lessonId = typeof row.lesson_id === "string" ? row.lesson_id : null;
  const audioStatus = typeof row.audio_status === "string" ? row.audio_status : "pending";
  const activityRetryable = status === "activities_failed" && buildAttempts < 3;
  const permanentFailure = status === "failed";

  return response({
    requestId,
    status,
    currentStage: typeof row.current_stage === "string" ? row.current_stage : status,
    progressPercent: typeof row.progress_percent === "number" ? row.progress_percent : 0,
    storyReady: Boolean(story),
    lessonReady: Boolean(lessonId),
    lessonId,
    lessonVersionId: typeof row.lesson_version_id === "string" ? row.lesson_version_id : null,
    assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : null,
    audioStatus,
    completedGroups: Array.isArray(row.completed_groups) ? row.completed_groups : [],
    failedGroups: Array.isArray(row.failed_groups) ? row.failed_groups : [],
    retryable: activityRetryable || (audioStatus === "failed" && audioAttempts < 3),
    permanentFailure,
    message: permanentFailure
      ? "AIko could not finish this lesson after several attempts. You can start a new lesson or retry later."
      : undefined,
    story,
  });
}
