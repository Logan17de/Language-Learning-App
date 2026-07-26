import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/auth/server-authorization";
import {
  generatePlayableLesson,
  generateStoryDraft,
  type GenerationAuditEntry,
} from "@/lib/gemini/lesson-engine-v2";
import {
  resolveLessonLibrary,
  selectLessonPlan,
} from "@/lib/gemini/lesson-library-v2";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

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
  return typeof value === "string" && value.length > 0 ? value : null;
}

function beginResult(value: Json): BeginResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const requestId = text(value.request_id);
  const level = value.level;
  if (
    !requestId ||
    (level !== "N5" &&
      level !== "N4" &&
      level !== "N3" &&
      level !== "N2" &&
      level !== "N1")
  ) {
    return null;
  }
  const reused = value.reused === true;
  const result: BeginResult = {
    requestId,
    jobId: text(value.job_id),
    level,
    reused,
    lessonId: text(value.lesson_id),
    lessonVersionId: text(value.lesson_version_id),
    assignmentId: text(value.assignment_id),
  };
  if (reused) {
    return result.lessonId && result.lessonVersionId && result.assignmentId
      ? result
      : null;
  }
  return result.jobId ? result : null;
}

function storedResult(value: Json): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export async function POST(request: NextRequest) {
  const auth = await authorize("learn");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid custom lesson request." },
      { status: 400 },
    );
  }
  const input = body as Record<string, unknown>;
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const requestedLevel = input.level;
  const validLevel =
    requestedLevel === "N5" ||
    requestedLevel === "N4" ||
    requestedLevel === "N3" ||
    requestedLevel === "N2" ||
    requestedLevel === "N1";
  if (topic.length < 2 || topic.length > 120 || !validLevel) {
    return NextResponse.json(
      { error: "Enter a topic and select a valid JLPT level." },
      { status: 400 },
    );
  }
  const level = requestedLevel as JLPTLevel;

  const client = await createClient();
  if (!client) {
    return NextResponse.json(
      { error: "Backend is not configured." },
      { status: 503 },
    );
  }

  const begun = await client.rpc("begin_custom_lesson_generation_v3", {
    p_topic: topic,
    p_level: level,
  });
  if (begun.error) {
    return NextResponse.json(
      { error: begun.error.message },
      { status: begun.error.code === "42501" ? 403 : 400 },
    );
  }
  const generation = beginResult(begun.data);
  if (!generation) {
    return NextResponse.json(
      { error: "The lesson request could not be started." },
      { status: 500 },
    );
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

  const startedAt = Date.now();
  try {
    const plan = await selectLessonPlan(
      client,
      auth.userId,
      topic,
      generation.level,
    );
    const story = await generateStoryDraft({
      topic,
      level: generation.level,
      plan,
    });
    const resolved = await resolveLessonLibrary(client, {
      topic,
      level: generation.level,
      plan,
      draft: story.draft,
    });
    const audit: GenerationAuditEntry[] = [
      story.audit,
      ...(resolved.audit ? [resolved.audit] : []),
    ];
    const lesson = await generatePlayableLesson({
      topic,
      level: generation.level,
      draft: story.draft,
      library: resolved.library,
      audit,
    });
    const stored = await client.rpc("store_generated_lesson_package_v2", {
      p_request_id: generation.requestId,
      p_package: lesson as unknown as Json,
      p_generation_seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    if (stored.error) throw new Error(stored.error.message);

    return NextResponse.json({
      requestId: generation.requestId,
      jobId: generation.jobId,
      ...storedResult(stored.data),
    });
  } catch (error) {
    const internalMessage =
      error instanceof Error ? error.message : "Lesson generation failed.";
    console.error("Custom lesson generation failed.", {
      requestId: generation.requestId,
      level: generation.level,
      message: internalMessage,
    });
    await client.rpc("fail_custom_lesson_generation", {
      p_request_id: generation.requestId,
      p_error: internalMessage,
    });
    const catalogMissing = internalMessage.startsWith("Import the ");
    return NextResponse.json(
      {
        error: catalogMissing
          ? internalMessage
          : "AIko could not finish this lesson. Please try the topic again.",
      },
      { status: catalogMissing ? 409 : 502 },
    );
  }
}
