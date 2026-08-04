import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/gemini/structured-output";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentPrompt,
  type RawStoryVocabulary,
  type SimpleStoryEnrichment,
} from "@/lib/gemini/simple-story-enrichment-contract";
import type { StoryOnlyDraft } from "@/lib/gemini/story-pipeline-v3";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

/**
 * Run the exact simple enrichment contract from enrichment_test.py and store
 * every returned surface form before the story is resolved for the reader.
 */
export async function enrichGeneratedStoryVocabulary(input: {
  admin: SupabaseClient;
  requestId: string;
  level: JLPTLevel;
  draft: StoryOnlyDraft;
}): Promise<{
  vocabulary: RawStoryVocabulary[];
  audit: GenerationAuditEntry;
}> {
  const japaneseStory = input.draft.lines
    .map((line) => line.japanese)
    .join("");
  const generated = await generateStructured<SimpleStoryEnrichment>({
    name: "story_vocabulary",
    prompt: storyEnrichmentPrompt(japaneseStory),
    schema: simpleStoryEnrichmentSchema,
    strictSchema: true,
    exactSchemaName: true,
    // The strict response schema is the complete enrichment contract. Do not
    // add a second semantic validator or change the tested prompt.
    validate: () => [],
    trace: { requestId: input.requestId, stage: "library" },
  });

  const stored = await input.admin.rpc("store_story_vocabulary_enrichment", {
    p_request_id: input.requestId,
    p_level: input.level,
    p_vocabulary: generated.value.vocabulary as unknown as Json,
    p_source_model: generated.model,
  });
  if (stored.error) {
    throw new Error(`Story vocabulary could not be stored: ${stored.error.message}`);
  }

  return {
    vocabulary: generated.value.vocabulary,
    audit: {
      stage: "library",
      model: generated.model,
      repaired: generated.repaired,
    },
  };
}
