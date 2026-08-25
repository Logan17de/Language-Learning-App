import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { processCustomLessonFastPath } from "@/lib/custom-lessons/fast-path";
import { withGenerationTraceContext } from "@/lib/custom-lessons/generation-trace";
import { getCustomLessonSchedulerDiagnostics } from "@/lib/custom-lessons/scheduler-diagnostics";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

export const runtime = "nodejs";
export const maxDuration = 300;

type BeginOutcome =
  | "queued"
  | "published"
  | "resume_request"
  | "resume_lesson";

interface BeginResult {
  outcome: BeginOutcome;
  requestId: string;
  jobId: string | null;
  level: JLPTLevel;
  reused: boolean;
  lessonId: string | null;
  lessonVersionId: string | null;
  assignmentId: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isLevel(value: unknown): value is JLPTLevel {
  return ["N5", "N4", "N3", "N2", "N1"].includes(String(value));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function beginResult(value: Json): BeginResult | null {
  const row = record(value);
  if (!row) return null;
  const outcome = text(row.outcome);
  const requestId = text(row.request_id);
  const level = row.level;
  if (
    !requestId ||
    !isLevel(level) ||
    (outcome !== "queued" &&
      outcome !== "published" &&
      outcome !== "resume_request" &&
      outcome !== "resume_lesson")
  ) {
    return null;
  }

  const result: BeginResult = {
    outcome,
    requestId,
    jobId: text(row.job_id),
    level,
    reused: row.reused === true,
    lessonId: text(row.lesson_id),
    lessonVersionId: text(row.lesson_version_id),
    assignmentId: text(row.assignment_id),
  };

  if (
    (outcome === "published" || outcome === "resume_lesson") &&
    !result.lessonId
  ) {
    return null;
  }
  if (outcome === "queued" && !result.jobId) return null;
  return result;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const auth = await authorize("learn", request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body: unknown = await request.json().catch(() => null);
  const input = record(body) ?? {};
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const level = input.level;
  if (topic.length < 2 || topic.length > 120 || !isLevel(level)) {
    return NextResponse.json(
      { error: "Enter a topic and select a valid JLPT level." },
      { status: 400 },
    );
  }

  const client = await createClient(request);
  if (!client) {
    return NextResponse.json(
      { error: "Backend is not configured." },
      { status: 503 },
    );
  }
  const rawClient = client as unknown as SupabaseClient;

  // A free learner may arrive here from a stale tab after another tab already
  // reserved today's lesson. Return the authoritative reservation instead of
  // asking the scheduler to create anything new.
  const stateResult = await rawClient.rpc("get_lesson_creation_state");
  const creationState = record(stateResult.data);
  if (
    !stateResult.error &&
    creationState?.plan === "free" &&
    creationState.can_create === false
  ) {
    const requestId = text(creationState.request_id);
    const lessonId = text(creationState.lesson_id);
    if (requestId && lessonId) {
      return NextResponse.json({
        requestId,
        lesson_id: lessonId,
        status: "published",
        outcome: "resume_lesson",
        reused: false,
      });
    }
    if (requestId) {
      return NextResponse.json(
        {
          requestId,
          status: text(creationState.request_status) ?? "generation_pending",
          outcome: "resume_request",
          reused: false,
        },
        { status: 202 },
      );
    }
  }

  let scheduler;
  try {
    scheduler = await getCustomLessonSchedulerDiagnostics();
  } catch (error) {
    console.error("Custom lesson scheduler diagnostics failed.", error);
    return NextResponse.json(
      {
        error:
          "Custom lesson scheduling is not configured. Ask an administrator to check the scheduler diagnostics.",
        code: "CUSTOM_LESSON_SCHEDULER_UNAVAILABLE",
      },
      { status: 503 },
    );
  }
  if (!scheduler.ready) {
    return NextResponse.json(
      {
        error:
          "Custom lesson scheduling is not configured. Ask an administrator to check the scheduler diagnostics.",
        code: "CUSTOM_LESSON_SCHEDULER_UNAVAILABLE",
        diagnostics: {
          jobActive: scheduler.jobActive,
          workerUrlConfigured: scheduler.workerUrlConfigured,
          workerSecretConfigured: scheduler.workerSecretConfigured,
        },
      },
      { status: 503 },
    );
  }

  const begun = await rawClient.rpc("begin_custom_lesson_generation_v5", {
    p_topic: topic,
    p_level: level,
  });
  if (begun.error) {
    return NextResponse.json(
      { error: begun.error.message },
      { status: begun.error.code === "42501" ? 403 : 400 },
    );
  }

  const rawGeneration = record(begun.data);
  if (rawGeneration?.outcome === "limit") {
    return NextResponse.json(
      {
        error:
          text(rawGeneration.message) ||
          "You have reached today's Premium lesson creation limit.",
        code: text(rawGeneration.code) ?? "DAILY_LESSON_LIMIT",
      },
      { status: 429 },
    );
  }

  const generation = beginResult(begun.data as Json);
  if (!generation) {
    return NextResponse.json(
      { error: "The lesson request could not be started." },
      { status: 500 },
    );
  }

  if (
    generation.outcome === "published" ||
    generation.outcome === "resume_lesson"
  ) {
    return NextResponse.json({
      requestId: generation.requestId,
      jobId: generation.jobId,
      lesson_id: generation.lessonId,
      lesson_version_id: generation.lessonVersionId,
      assignment_id: generation.assignmentId,
      status: "published",
      outcome: generation.outcome,
      reused: generation.reused,
    });
  }

  // The first invocation keeps consuming ready persisted checkpoints while
  // there is safe Vercel runtime left. Supabase cron remains the recovery path
  // if the invocation is interrupted.
  after(async () => {
    try {
      await withGenerationTraceContext(
        { requestId: generation.requestId },
        () =>
          processCustomLessonFastPath({
            requestId: generation.requestId,
            deferAudio: true,
          }),
      );
    } catch (error) {
      console.error(
        "Custom lesson kickoff stopped; the durable worker will resume it.",
        {
          requestId: generation.requestId,
          stage: "queued",
          attempt: 1,
          errorClassification: "transient",
          providerRequestId: null,
          durationMs: Date.now() - startedAt,
          action: "resumed",
          message:
            error instanceof Error ? error.message : "Unknown worker error.",
        },
      );
    }
  });

  return NextResponse.json(
    {
      requestId: generation.requestId,
      jobId: generation.jobId,
      status: "queued",
      currentStage: "queued",
      progressPercent: 0,
      outcome: generation.outcome,
      reused: generation.reused,
    },
    { status: 202 },
  );
}
