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
 * Target kanji and grammar are prompt guidance only. Acceptance is structural:
 * a valid story is not rejected because the model used different content.
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
    targetGrammar: input.plan.grammar.map((item) => item.pattern),
    targetKanji: input.plan.kanji.map((item) => item.character),
  });

  const result = await generateStructured<StoryPassageOutput>({
    name: "japanese_lesson",
    prompt,
    schema: storyGenerationSchema,
    strictSchema: true,
    exactSchemaName: true,
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
