import { after, NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import { withGenerationTraceContext } from "@/lib/custom-lessons/generation-trace";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

export const runtime = "nodejs";
export const maxDuration = 300;

interface BeginResult {
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

function beginResult(value: Json): BeginResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = text(value.request_id);
  const level = value.level;
  if (!requestId || !["N5", "N4", "N3", "N2", "N1"].includes(String(level))) return null;
  const result: BeginResult = {
    requestId,
    jobId: text(value.job_id),
    level: level as JLPTLevel,
    reused: value.reused === true,
    lessonId: text(value.lesson_id),
    lessonVersionId: text(value.lesson_version_id),
    assignmentId: text(value.assignment_id),
  };
  if (result.reused) {
    return result.lessonId && result.lessonVersionId && result.assignmentId ? result : null;
  }
  return result.jobId ? result : null;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const auth = await authorize("learn");
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const level = input.level;
  if (topic.length < 2 || topic.length > 120 || !["N5", "N4", "N3", "N2", "N1"].includes(String(level))) {
    return NextResponse.json(
      { error: "Enter a topic and select a valid JLPT level." },
      { status: 400 },
    );
  }

  const client = await createClient();
  if (!client) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const begun = await client.rpc("begin_custom_lesson_generation_v4", {
    p_topic: topic,
    p_level: level as JLPTLevel,
  });
  if (begun.error) {
    return NextResponse.json(
      { error: begun.error.message },
      { status: begun.error.code === "42501" ? 403 : 400 },
    );
  }
  const generation = beginResult(begun.data);
  if (!generation) {
    return NextResponse.json({ error: "The lesson request could not be started." }, { status: 500 });
  }
  if (generation.reused) {
    return NextResponse.json({
      requestId: generation.requestId,
      jobId: null,
      lesson_id: generation.lessonId,
      lesson_version_id: generation.lessonVersionId,
      assignment_id: generation.assignmentId,
      status: "published",
      reused: true,
    });
  }

  // This is only a low-latency kick. The persisted claim and scheduled worker
  // are the durability boundary if this invocation is interrupted.
  after(async () => {
    try {
      await withGenerationTraceContext({ requestId: generation.requestId }, () =>
        processCustomLessonJobs({ requestId: generation.requestId, maxCycles: 1 }),
      );
    } catch (error) {
      console.error("Custom lesson kickoff stopped; the durable worker will resume it.", {
        requestId: generation.requestId,
        stage: "queued",
        attempt: 1,
        errorClassification: "transient",
        providerRequestId: null,
        durationMs: Date.now() - startedAt,
        action: "resumed",
        message: error instanceof Error ? error.message : "Unknown worker error.",
      });
    }
  });

  return NextResponse.json(
    {
      requestId: generation.requestId,
      jobId: generation.jobId,
      status: "queued",
      currentStage: "queued",
      progressPercent: 0,
      reused: false,
    },
    { status: 202 },
  );
}
