import { after, NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorize } from "@/lib/auth/server-authorization";
import { withGenerationTraceContext } from "@/lib/custom-lessons/generation-trace";
import { processCustomLessonJobs } from "@/lib/custom-lessons/job-runner";
import { generateAdaptiveStoryDraft } from "@/lib/gemini/adaptive-story-generation";
import { buildInteractiveStoryForLearner } from "@/lib/gemini/interactive-story-v3";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import { selectLessonPlanV3 } from "@/lib/gemini/lesson-plan-v3";
import { enrichGeneratedStoryVocabulary } from "@/lib/gemini/simple-story-enrichment";
import { resolveStoryFromExistingLibrary } from "@/lib/gemini/story-library-existing-only";
import type { StoryOnlyDraft } from "@/lib/gemini/story-pipeline-v3";
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

type StoryGenerationStage =
  | "lesson_plan"
  | "story"
  | "vocabulary_enrichment"
  | "library_lookup"
  | "story_persistence";

function storyFailureMessage(stage: StoryGenerationStage): string {
  if (stage === "story") {
    return "AIko could not finish writing this story. Please try the topic again.";
  }
  if (stage === "vocabulary_enrichment" || stage === "library_lookup") {
    return "AIko wrote the story but could not prepare its tappable vocabulary. Please try again.";
  }
  if (stage === "story_persistence") {
    return "AIko wrote the story but could not save it. Please try again.";
  }
  return "AIko could not select the lesson material for this story. Please try again.";
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

function storyKanjiCounts(draft: StoryOnlyDraft): Array<{
  character: string;
  count: number;
}> {
  const counts = new Map<string, number>();
  for (const line of draft.lines) {
    for (const character of line.japanese.match(/\p{Script=Han}/gu) ?? []) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([character, count]) => ({
    character,
    count,
  }));
}

export async function POST(request: NextRequest) {
  const requestStartedAt = Date.now();
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

  let planMs = 0;
  let storyMs = 0;
  let enrichmentMs = 0;
  let libraryLookupMs = 0;
  let persistenceMs = 0;
  let currentStage: StoryGenerationStage = "lesson_plan";
  try {
    let stageStartedAt = Date.now();
    const plan = await selectLessonPlanV3(
      client,
      auth.userId,
      topic,
      generation.level,
    );
    planMs = Date.now() - stageStartedAt;

    currentStage = "story";
    stageStartedAt = Date.now();
    // Generate the fixed passage first. Its Japanese text becomes the complete
    // input to the separate simple vocabulary-enrichment call below.
    const story = await generateAdaptiveStoryDraft({
      requestId: generation.requestId,
      topic,
      level: generation.level,
      plan,
    });
    storyMs = Date.now() - stageStartedAt;

    currentStage = "vocabulary_enrichment";
    stageStartedAt = Date.now();
    const admin = createAdminClient() as unknown as SupabaseClient;
    const enrichment = await enrichGeneratedStoryVocabulary({
      admin,
      requestId: generation.requestId,
      level: generation.level,
      draft: story.draft,
    });
    enrichmentMs = Date.now() - stageStartedAt;

    currentStage = "library_lookup";
    stageStartedAt = Date.now();
    // Resolve newly inserted or reused raw surface words into tappable story
    // terms without duplicating vocabulary already present in the library.
    const resolved = await resolveStoryFromExistingLibrary(client, {
      level: generation.level,
      plan,
      draft: story.draft,
    });
    libraryLookupMs = Date.now() - stageStartedAt;

    const interactiveStory = buildInteractiveStoryForLearner(
      resolved.draft,
      resolved.library,
    );
    const audit: GenerationAuditEntry[] = [
      story.audit,
      enrichment.audit,
      ...resolved.audits,
    ];

    currentStage = "story_persistence";
    stageStartedAt = Date.now();
    const [saved, exposure] = await Promise.all([
      admin.from("progressive_lesson_drafts").upsert(
        {
          request_id: generation.requestId,
          job_id: generation.jobId,
          user_id: auth.userId,
          topic,
          jlpt_level: generation.level,
          story_draft: resolved.draft,
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
      ),
      (client as unknown as SupabaseClient).rpc("record_story_kanji_exposures", {
        p_request_id: generation.requestId,
        p_counts: storyKanjiCounts(story.draft) as unknown as Json,
      }),
    ]);
    persistenceMs = Date.now() - stageStartedAt;
    if (saved.error) throw new Error(saved.error.message);
    if (exposure.error) {
      throw new Error(
        `Story kanji progress could not be saved: ${exposure.error.message}`,
      );
    }

    console.info("Custom lesson story pipeline timings.", {
      requestId: generation.requestId,
      level: generation.level,
      totalMs: Date.now() - requestStartedAt,
      planMs,
      storyMs,
      enrichmentMs,
      libraryLookupMs,
      persistenceMs,
      storyRepaired: story.audit.repaired,
      libraryMode: "raw-story-enrichment",
      tappableVocabularyCount: resolved.library.vocabulary.length,
    });

    after(async () => {
      try {
        await withGenerationTraceContext(
          { requestId: generation.requestId },
          () =>
            processCustomLessonJobs({
              requestId: generation.requestId,
              maxCycles: 2,
            }),
        );
      } catch (error) {
        console.error("Custom lesson background worker stopped.", {
          requestId: generation.requestId,
          message:
            error instanceof Error ? error.message : "Unknown worker error.",
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
      currentStage,
      message: internalMessage,
      totalMs: Date.now() - requestStartedAt,
      planMs,
      storyMs,
      enrichmentMs,
      libraryLookupMs,
      persistenceMs,
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
          : storyFailureMessage(currentStage),
        code: "STORY_PIPELINE_FAILED",
        stage: currentStage,
        requestId: generation.requestId,
      },
      { status: catalogMissing ? 409 : 502 },
    );
  }
}
