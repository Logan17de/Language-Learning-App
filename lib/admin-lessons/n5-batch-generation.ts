import "server-only";

import { submitLessonBatch } from "@/lib/admin-lessons/lesson-batch-generation";

// Compatibility facade for older internal imports. There is no N5-specific
// provider/scheduler implementation anymore; every level uses the canonical
// JLPT Batch engine.
export {
  syncActiveGenerationBatches,
  syncGenerationBatch,
} from "@/lib/admin-lessons/lesson-batch-generation";
export {
  getGenerationBatchDetail,
  getGenerationBatchSummary,
  getGenerationRequest,
  importValidGenerationRequests,
  listGenerationBatches,
  saveManualGenerationLesson,
} from "@/lib/admin-lessons/lesson-generation-staging";
export type { GenerationBatchSummary } from "@/lib/admin-lessons/lesson-generation-staging";

export async function submitN5LessonBatch(input: {
  count: number;
  userId: string;
}) {
  return submitLessonBatch({ ...input, level: "N5" });
}
