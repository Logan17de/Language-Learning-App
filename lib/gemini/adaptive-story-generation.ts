import "server-only";

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { JLPTLevel } from "@/types/lesson";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import { generateStructured } from "@/lib/gemini/structured-output";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import {
  STORY_MAX_SENTENCES,
  STORY_MIN_SENTENCES,
  storyGenerationPrompt,
  storyGenerationSchema,
} from "@/lib/gemini/story-generation-contract";
import type {
  LessonPlanV3,
  StoryPassageOutput,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";
import { normalizeStoryPassage } from "@/lib/gemini/story-pipeline-v3";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const cachedAcceptedGrammarForms = unstable_cache(
  async (patternKey: string): Promise<Array<[string, string[]]>> => {
    const patterns = patternKey.split("\u0000").filter(Boolean);
    if (patterns.length < 1) return [];
    const admin = createAdminClient() as unknown as SupabaseClient;
    const result = await admin
      .from("grammar_catalog")
      .select("pattern,accepted_patterns")
      .in("pattern", patterns)
      .eq("active", true);
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []).map((row) => [
      String(row.pattern),
      Array.isArray(row.accepted_patterns)
        ? row.accepted_patterns.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    ]);
  },
  ["story-accepted-grammar-forms"],
  { revalidate: 900 },
);

async function acceptedGrammarForms(
  patterns: string[],
): Promise<Map<string, string[]>> {
  const normalized = [...new Set(patterns.map((item) => item.trim()).filter(Boolean))]
    .sort();
  return new Map(await cachedAcceptedGrammarForms(normalized.join("\u0000")));
}

function sentenceCount(value: string): number {
  return value
    .split(/(?<=[。！？!?])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .length;
}

function structuralStoryIssues(
  value: unknown,
  plan: LessonPlanV3,
  acceptedForms: Map<string, string[]>,
): string[] {
  if (!isRecord(value)) {
    return ["Story must be an object."];
  }
  const issues: string[] = [];
  const required = [
    "selected_interest",
    "japanese_title",
    "english_title",
    "japanese_story",
    "english_translation",
  ] as const;
  for (const field of required) {
    if (!stringValue(value[field])) {
      issues.push(`Story field ${field} is required.`);
    }
  }

  const storyText = typeof value.japanese_story === "string"
    ? value.japanese_story.trim()
    : "";
  if (storyText) {
    const count = sentenceCount(storyText);
    if (count < STORY_MIN_SENTENCES || count > STORY_MAX_SENTENCES) {
      issues.push(
        `Story needs ${STORY_MIN_SENTENCES}-${STORY_MAX_SENTENCES} sentences; received ${count}.`,
      );
    }
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(storyText)) {
      issues.push("Japanese story needs Japanese text.");
    }
  }

  for (const target of plan.kanji) {
    if (!storyText.includes(target.character)) {
      issues.push(`Story does not use target kanji ${target.character}.`);
    }
  }
  for (const target of plan.grammar) {
    const forms = [
      target.pattern,
      ...(acceptedForms.get(target.pattern) ?? []),
    ];
    if (!forms.some((form) => storyUsesGrammarPattern(storyText, form))) {
      issues.push(`Story does not use grammar ${target.pattern}.`);
    }
  }

  return unique(issues);
}

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
  const acceptedForms = await acceptedGrammarForms(
    input.plan.grammar.map((item) => item.pattern),
  );
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
    validate: (value) =>
      structuralStoryIssues(value, input.plan, acceptedForms),
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
