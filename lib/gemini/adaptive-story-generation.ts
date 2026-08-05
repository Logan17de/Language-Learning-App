import "server-only";

import type { JLPTLevel } from "@/types/lesson";
import { generateStructured } from "@/lib/gemini/structured-output";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import {
  storyGenerationPrompt,
  storyGenerationSchema,
} from "@/lib/gemini/story-generation-contract";
import type {
  LessonPlanV3,
  StoryPassageOutput,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";
import { normalizeStoryPassage } from "@/lib/gemini/story-pipeline-v3";

/**
 * API call 1. This call is intentionally limited to one passage-style story.
 * Existing library taps and all activities are resolved only after this
 * response has passed story validation.
 */
export async function generateAdaptiveStoryDraft(input: {
  requestId: string;
  topic: string;
  level: JLPTLevel;
  plan: LessonPlanV3;
}): Promise<{ draft: StoryOnlyDraft; audit: GenerationAuditEntry }> {
  const prompt = storyGenerationPrompt({
    languageLevel: `JLPT ${input.level}`,
    topic: input.topic,
    naturalInterests: input.plan.interests,
    targetGrammar: input.plan.grammar.map((item) => item.pattern),
    targetKanji: input.plan.kanji.map((item) => item.character),
  });

  const result = await generateStructured<StoryPassageOutput>({
    name: "japanese_lesson",
    prompt,
    schema: storyGenerationSchema,
    strictSchema: true,
    exactSchemaName: true,
    // This deliberately mirrors the tested story_test.py flow: the provider's
    // strict JSON schema is the story gate. Do not add a second semantic repair
    // pass that rejects natural grammar variants after valid generation.
    validate: () => [],
    trace: {
      requestId: input.requestId,
      stage: "story",
      level: input.level,
    },
  });

  return {
    draft: normalizeStoryPassage(result.value),
    audit: {
      stage: "story",
      model: result.model,
      repaired: result.repaired,
    },
  };
}
