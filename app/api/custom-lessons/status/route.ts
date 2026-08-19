import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { buildInteractiveStory } from "@/lib/gemini/lesson-activity-groups";
import type { ResolvedLessonLibrary, StoryDraft } from "@/lib/gemini/lesson-engine-v2";
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

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

async function confirmStoryEntitlement(
  admin: SupabaseClient,
  requestId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [profile, request] = await Promise.all([
    admin
      .from("profiles")
      .select("subscription_plan")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("custom_lesson_requests")
      .select("id,uses_free_daily_entitlement,entitlement_consumed_at")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profile.error || request.error || !profile.data || !request.data) {
    return { ok: false, message: "The lesson entitlement could not be verified." };
  }

  if (profile.data.subscription_plan !== "free") return { ok: true };
  if (request.data.uses_free_daily_entitlement !== true) {
    return { ok: false, message: "The free lesson entitlement is invalid." };
  }
  if (request.data.entitlement_consumed_at) return { ok: true };

  const consumed = await admin
    .from("custom_lesson_requests")
    .update({ entitlement_consumed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("user_id", userId)
    .eq("uses_free_daily_entitlement", true)
    .is("entitlement_consumed_at", null)
    .select("id,entitlement_consumed_at")
    .maybeSingle();

  if (consumed.error) {
    return { ok: false, message: consumed.error.message };
  }
  if (consumed.data?.id === requestId && consumed.data.entitlement_consumed_at) {
    return { ok: true };
  }

  // A concurrent status poll may have consumed the reservation between the
  // initial read and UPDATE. Re-read the exact row and accept only an explicit,
  // already-consumed acknowledgement. A zero-row UPDATE never exposes Story by
  // itself.
  const acknowledged = await admin
    .from("custom_lesson_requests")
    .select("id,uses_free_daily_entitlement,entitlement_consumed_at")
    .eq("id", requestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (acknowledged.error) {
    return { ok: false, message: acknowledged.error.message };
  }
  return acknowledged.data?.id === requestId &&
    acknowledged.data.uses_free_daily_entitlement === true &&
    Boolean(acknowledged.data.entitlement_consumed_at)
    ? { ok: true }
    : { ok: false, message: "The free lesson entitlement was not consumed." };
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const auth = await authorize("learn");
  if (!auth.ok) return response({ error: auth.message }, auth.status);
  const requestId = request.nextUrl.searchParams.get("requestId")?.trim() ?? "";
  if (!UUID.test(requestId)) return response({ error: "A valid generation request is required." }, 400);

  const admin = createAdminClient() as unknown as SupabaseClient;
  const found = await admin
    .from("progressive_lesson_drafts")
    .select([
      "request_id", "user_id", "status", "current_stage", "progress_percent",
      "story_draft", "library_snapshot", "completed_groups", "failed_groups",
      "lesson_id", "lesson_version_id", "assignment_id", "audio_status",
      "resume_stage", "next_attempt_at", "failure_classification", "last_error",
    ].join(","))
    .eq("request_id", requestId)
    .eq("user_id", auth.userId)
    .maybeSingle();
  if (found.error) {
    console.error("Custom lesson status lookup failed.", {
      requestId,
      stage: "status",
      attempt: 1,
      errorClassification: "transient",
      providerRequestId: null,
      durationMs: Date.now() - startedAt,
      action: "resumed",
      message: found.error.message,
    });
    return response({ error: "AIko could not load this lesson's progress." }, 500);
  }
  if (!found.data) return response({ error: "The lesson generation request was not found." }, 404);

  const row = found.data as unknown as Record<string, unknown>;
  const status = stringValue(row.status, "permanent_failure");
  const currentStage = stringValue(row.current_stage, status);
  let story: ReturnType<typeof buildInteractiveStory> | null = null;
  if (row.story_draft && row.library_snapshot) {
    try {
      story = buildInteractiveStory(
        row.story_draft as StoryDraft,
        row.library_snapshot as ResolvedLessonLibrary,
      );
    } catch (error) {
      console.warn("Stored custom lesson story is waiting for checkpoint repair.", {
        requestId,
        stage: currentStage,
        attempt: 1,
        errorClassification: "content",
        providerRequestId: null,
        durationMs: Date.now() - startedAt,
        action: "regenerated",
        message: error instanceof Error ? error.message : "Invalid story checkpoint.",
      });
    }
  }

  // Story is the first usable learning content in the progressive flow. A free
  // learner must receive a positive, persisted entitlement acknowledgement
  // before Story can leave the server. Later generation failures cannot refund
  // learning content that has already been exposed.
  if (story) {
    const entitlement = await confirmStoryEntitlement(admin, requestId, auth.userId);
    if (!entitlement.ok) {
      console.error("Free lesson entitlement could not be confirmed before Story exposure.", {
        requestId,
        userId: auth.userId,
        message: entitlement.message,
      });
      return response(
        { error: "AIko could not open this lesson safely. Please try again." },
        409,
      );
    }
  }

  const lessonId = typeof row.lesson_id === "string" ? row.lesson_id : null;
  const audioStatus = stringValue(row.audio_status, "pending");
  const retryable = status === "retryable_failure";
  const permanentFailure = status === "permanent_failure";
  return response({
    requestId,
    status,
    currentStage,
    resumeStage: typeof row.resume_stage === "string" ? row.resume_stage : null,
    nextAttemptAt: typeof row.next_attempt_at === "string" ? row.next_attempt_at : null,
    progressPercent: typeof row.progress_percent === "number" ? row.progress_percent : 0,
    storyReady: Boolean(story),
    lessonReady: Boolean(lessonId),
    lessonId,
    lessonVersionId: typeof row.lesson_version_id === "string" ? row.lesson_version_id : null,
    assignmentId: typeof row.assignment_id === "string" ? row.assignment_id : null,
    audioStatus,
    completedGroups: Array.isArray(row.completed_groups) ? row.completed_groups : [],
    failedGroups: Array.isArray(row.failed_groups) ? row.failed_groups : [],
    retryable,
    permanentFailure,
    failureClassification: typeof row.failure_classification === "string"
      ? row.failure_classification
      : null,
    message: permanentFailure
      ? stringValue(row.last_error, "AIko could not finish this lesson. Start a new lesson after checking the reported configuration or catalog issue.")
      : retryable
        ? "A temporary stage failed. AIko will retry it automatically."
        : undefined,
    story,
  });
}