import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";
import { buildInteractiveStory } from "@/lib/gemini/lesson-activity-groups";
import { generateAdaptiveStoryDraft } from "@/lib/gemini/adaptive-story-generation";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import {
  resolveLessonLibrary,
  selectLessonPlan,
} from "@/lib/gemini/lesson-library-v2";
import { createAdminClient } from "@/lib/supabase/admin";
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

  try {
    const plan = await selectLessonPlan(
      client,
      auth.userId,
      topic,
      generation.level,
    );
    const story = await generateAdaptiveStoryDraft({
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
    const interactiveStory = buildInteractiveStory(
      story.draft,
      resolved.library,
    );
    const audit: GenerationAuditEntry[] = [
      story.audit,
      ...(resolved.audit ? [resolved.audit] : []),
    ];
    const admin = createAdminClient() as unknown as SupabaseClient;
    const saved = await admin.from("progressive_lesson_drafts").upsert(
      {
        request_id: generation.requestId,
        job_id: generation.jobId,
        user_id: auth.userId,
        topic,
        jlpt_level: generation.level,
        story_draft: story.draft,
        library_snapshot: resolved.library,
        generation_audit: audit,
        status: "activities_queued",
        current_stage: "activities_queued",
        progress_percent: 20,
        completed_groups: [],
        failed_groups: [],
        last_error: null,
      },
      { onConflict: "request_id" },
    );
    if (saved.error) throw new Error(saved.error.message);

    after(async () => {
      try {
        await processCustomLessonJobs({
          requestId: generation.requestId,
          maxCycles: 2,
        });
      } catch (error) {
        console.error("Custom lesson background worker stopped.", {
          requestId: generation.requestId,
          message: error instanceof Error ? error.message : "Unknown worker error.",
        });
      }
    });

    return NextResponse.json({
      requestId: generation.requestId,
      jobId: generation.jobId,
      status: "story_ready",
      reused: false,
      story: interactiveStory,
    });
  } catch (error) {
    const internalMessage =
      error instanceof Error ? error.message : "Lesson generation failed.";
    console.error("Custom lesson story generation failed.", {
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
          : "AIko could not prepare this story. Please try the topic again.",
      },
      { status: catalogMissing ? 409 : 502 },
    );
  }
}
