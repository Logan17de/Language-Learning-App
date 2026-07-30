import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JLPTLevel } from "@/types/lesson";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import type {
  LessonPlanV3,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";

const STORY_MIN_LINES = 10;
const STORY_MAX_LINES = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function stringArray(minItems = 0, maxItems = 100): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
  };
}

const storySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "japaneseTitle", "summary", "storyPreview", "tags", "lines"],
  properties: {
    title: { type: "string" },
    japaneseTitle: { type: "string" },
    summary: { type: "string" },
    storyPreview: { type: "string" },
    tags: stringArray(2, 6),
    lines: {
      type: "array",
      minItems: STORY_MIN_LINES,
      maxItems: STORY_MAX_LINES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["japanese", "english"],
        properties: {
          japanese: { type: "string" },
          english: { type: "string" },
        },
      },
    },
  },
};

async function acceptedGrammarForms(
  patterns: string[],
): Promise<Map<string, string[]>> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const result = await admin
    .from("grammar_catalog")
    .select("pattern,accepted_patterns")
    .in("pattern", patterns)
    .eq("active", true);
  if (result.error) throw new Error(result.error.message);
  return new Map(
    (result.data ?? []).map((row) => [
      String(row.pattern),
      Array.isArray(row.accepted_patterns)
        ? row.accepted_patterns.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
    ]),
  );
}

function structuralStoryIssues(
  value: unknown,
  plan: LessonPlanV3,
  acceptedForms: Map<string, string[]>,
): string[] {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return ["Story must contain lines."];
  }
  const issues: string[] = [];
  if (
    value.lines.length < STORY_MIN_LINES ||
    value.lines.length > STORY_MAX_LINES
  ) {
    issues.push(`Story needs ${STORY_MIN_LINES}-${STORY_MAX_LINES} lines.`);
  }

  const storyText = value.lines
    .flatMap((line) =>
      isRecord(line) && typeof line.japanese === "string"
        ? [line.japanese]
        : [],
    )
    .join("\n");

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

  for (const [lineIndex, line] of value.lines.entries()) {
    if (
      !isRecord(line) ||
      !stringValue(line.japanese) ||
      !stringValue(line.english)
    ) {
      issues.push(`Story line ${lineIndex + 1} is incomplete.`);
      continue;
    }
    if (
      !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
        line.japanese,
      )
    ) {
      issues.push(`Story line ${lineIndex + 1} needs Japanese text.`);
    }
  }

  return unique(issues);
}

/**
 * API call 1. This call is intentionally limited to the story itself.
 * Tokenization, readings, meanings, library enrichment, and activities happen
 * only after this response has passed story validation.
 */
export async function generateAdaptiveStoryDraft(input: {
  topic: string;
  level: JLPTLevel;
  plan: LessonPlanV3;
}): Promise<{ draft: StoryOnlyDraft; audit: GenerationAuditEntry }> {
  const acceptedForms = await acceptedGrammarForms(
    input.plan.grammar.map((item) => item.pattern),
  );
  const prompt = [
    "Create one coherent Japanese learning story for AIko.",
    `Custom topic: ${input.topic}`,
    `JLPT ceiling: ${input.level}`,
    `Length: ${STORY_MIN_LINES}-${STORY_MAX_LINES} short lines.`,
    `Target kanji that must appear naturally: ${input.plan.kanji.map((item) => item.character).join("、")}`,
    `Target grammar that must appear naturally: ${input.plan.grammar.map((item) => item.pattern).join("、")}`,
    ...(input.plan.interests.length > 0
      ? [
          `Learner's natural interests: ${input.plan.interests.join("、")}. Use them only when they fit the custom topic naturally.`,
        ]
      : []),
    "Use every target naturally. Inflected, polite, contracted, and conversational forms are allowed when they preserve the requested grammar.",
    "For kanji-bearing content words, strongly prefer morphology supported by AIko's deterministic lexicon: dictionary/plain forms, polite non-past/negative/past, plain negative/past, て-form, ている, potential, passive, causative, ～たい, ～てしまう/ちゃう/じゃう, and negative conditional/なきゃ.",
    "Avoid unnecessary volitional, imperative, honorific-irregular, or deeply chained verb forms. Use one only when a required target grammar specifically needs it, and keep that construction short and conventional.",
    "You may use other useful kanji, including kanji the learner has not seen before. Do not add furigana or bracketed readings inside the story.",
    "Keep the voice natural, coherent, and appropriate for the JLPT ceiling.",
    "Return only story metadata and the Japanese/English story lines.",
    "Do not return vocabulary terms, tokenization, readings, dictionary forms, meanings, grammar explanations, exercises, questions, answers, or audio instructions. A separate enrichment call handles all of those later.",
  ].join("\n");

  const result = await generateStructured<StoryOnlyDraft>({
    name: "story-only draft",
    prompt,
    schema: storySchema,
    validate: (value) =>
      structuralStoryIssues(value, input.plan, acceptedForms),
  });

  return {
    draft: result.value,
    audit: {
      stage: "story",
      model: result.model,
      repaired: result.repaired,
    },
  };
}
