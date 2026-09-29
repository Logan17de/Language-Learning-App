import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import type { LessonPlanV3 } from "@/lib/gemini/story-pipeline-v3";
import type { JLPTLevel } from "@/types/lesson";

/**
 * Custom-topic generation treats the JLPT kanji/grammar catalogs as target
 * identities only. Story vocabulary enrichment ends after the original story
 * has been indexed against local JMdict; later lesson stages teach directly
 * from the fixed story and selected target identities.
 *
 * Keep this function as a compatibility seam for the durable worker, but never
 * call a model and never mutate kanji_records or grammar_records here.
 */
export async function ensureLessonPlanTeachingRecords(_input: {
  admin: SupabaseClient;
  requestId: string;
  topic: string;
  level: JLPTLevel;
  plan: LessonPlanV3;
}): Promise<GenerationAuditEntry> {
  return {
    stage: "library",
    model: "catalog-identities-only",
    repaired: false,
  };
}
