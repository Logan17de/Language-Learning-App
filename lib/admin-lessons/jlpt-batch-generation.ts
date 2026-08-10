import "server-only";

// Compatibility facade. The canonical implementation is split by concern:
// - lesson-generation-contract.ts: prompt/schema/validation
// - lesson-generation-staging.ts: review/manual repair/import
// - lesson-batch-generation.ts: target scheduling/provider/sync
export {
  submitLessonBatch,
  syncActiveGenerationBatches,
  syncGenerationBatch,
} from "@/lib/admin-lessons/lesson-batch-generation";
export {
  MAX_BATCH_LESSONS,
  SUPPORTED_BATCH_LEVELS,
  TARGET_GRAMMAR_COUNT,
  TARGET_KANJI_COUNT,
  normalizeBatchLevel,
  targetSetSignature,
} from "@/lib/admin-lessons/lesson-generation-contract";
export type { SupportedBatchLevel } from "@/lib/admin-lessons/lesson-generation-contract";
export {
  getGenerationBatchDetail,
  getGenerationBatchSummary,
  getGenerationRequest,
  importValidGenerationRequests,
  listGenerationBatches,
  saveManualGenerationLesson,
} from "@/lib/admin-lessons/lesson-generation-staging";
export type { GenerationBatchSummary } from "@/lib/admin-lessons/lesson-generation-staging";
