import "server-only";

import {
  processCustomLessonJobs,
  type CustomLessonWorkerResult,
} from "@/lib/custom-lessons/job-runner";

const DEFAULT_FAST_PATH_RUNTIME_MS = 270_000;
const MAX_FAST_PATH_STAGES = 16;

function terminalStatus(status: CustomLessonWorkerResult["status"]): boolean {
  return status === "retryable_failure" ||
    status === "permanent_failure" ||
    status === "completed" ||
    status === "idle";
}

function minimumBudgetForNextStage(status: CustomLessonWorkerResult["status"]): number {
  if (status === "story_building") return 80_000;
  if (status === "vocabulary_enrichment") return 30_000;
  if (status === "library_resolution") return 30_000;
  // Grammar + reading can contain two sequential structured calls, so leave a
  // much larger safety window before starting any activity group.
  if (status === "activity_groups") return 140_000;
  if (status === "final_validation") return 25_000;
  if (status === "lesson_saving") return 25_000;
  if (status === "audio") return 90_000;
  return 20_000;
}

/**
 * Consume already-due custom-lesson stages immediately instead of waiting for
 * the next once-per-minute recovery cron tick between every checkpoint.
 *
 * Every stage is still claimed and persisted through processCustomLessonJobs,
 * so interruption remains safe. The fast path stops before audio by default:
 * once lesson_saving stores lesson_id, the learner can open the lesson and the
 * scheduler can prepare audio independently on its next invocation.
 */
export async function processCustomLessonFastPath(options: {
  requestId?: string;
  deferAudio?: boolean;
  maxRuntimeMs?: number;
} = {}): Promise<CustomLessonWorkerResult> {
  const startedAt = Date.now();
  const maxRuntimeMs = Math.max(
    30_000,
    Math.min(options.maxRuntimeMs ?? DEFAULT_FAST_PATH_RUNTIME_MS, 275_000),
  );
  const deferAudio = options.deferAudio !== false;
  let activeRequestId = options.requestId;
  let latest: CustomLessonWorkerResult | null = null;

  for (let stageCount = 0; stageCount < MAX_FAST_PATH_STAGES; stageCount += 1) {
    if (latest) {
      if (terminalStatus(latest.status)) break;
      if (deferAudio && latest.status === "audio" && latest.lessonReady) break;

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = maxRuntimeMs - elapsedMs;
      if (remainingMs < minimumBudgetForNextStage(latest.status)) break;
    }

    const result = await processCustomLessonJobs({
      requestId: activeRequestId,
      maxCycles: 1,
    });
    latest = result;
    activeRequestId = result.requestId ?? activeRequestId;
    if (!result.claimed) break;
  }

  return latest ?? {
    claimed: false,
    requestId: activeRequestId ?? null,
    status: "idle",
    lessonReady: false,
  };
}
