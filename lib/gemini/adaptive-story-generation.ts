import "server-only";

import { unstable_cache } from "next/cache";
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
  StoryPassageOutput,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";
import { normalizeStoryPassage } from "@/lib/gemini/story-pipeline-v3";

const STORY_MIN_SENTENCES = 10;
const STORY_MAX_SENTENCES = 15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

const storySchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "selected_interest",
    "japanese_title",
    "english_title",
    "japanese_story",
    "english_translation",
  ],
  properties: {
    selected_interest: { type: "string" },
    japanese_title: { type: "string" },
    english_title: { type: "string" },
    japanese_story: { type: "string" },
    english_translation: { type: "string" },
  },
};

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
  const interestText = input.plan.interests.length > 0
    ? input.plan.interests.join(", ")
    : "No learner interests were provided.";
  const prompt = [
    "Generate a Japanese language-learning story.",
    "",
    "Learner requirements:",
    `- Language level: JLPT ${input.level}`,
    `- Story topic: ${input.topic}`,
    `- Available learner interests: ${interestText}`,
    `- Target grammar: ${input.plan.grammar.map((item) => item.pattern).join(", ")}`,
    `- Target kanji: ${input.plan.kanji.map((item) => item.character).join(", ")}`,
    "",
    "Story requirements:",
    "- The story must primarily focus on the given topic.",
    `- Write one coherent story containing ${STORY_MIN_SENTENCES}-${STORY_MAX_SENTENCES} natural Japanese sentences.`,
    "- Return the Japanese story as one continuous string, not an array.",
    "- Select exactly one learner interest that fits the story naturally.",
    "- When no provided interest fits naturally, choose a suitable interest yourself.",
    "- When no learner interests are provided, choose a suitable interest yourself.",
    "- Do not force an interest into the story.",
    "- Naturally use every provided target grammar pattern at least once.",
    "- Naturally use every provided target kanji at least once.",
    `- Keep all other vocabulary and grammar appropriate for JLPT ${input.level}.`,
    "- Make the story engaging, educational, and easy to follow.",
    "- Keep romantic interactions respectful and age-appropriate.",
    "- Use Japanese quotation marks 「」 only for direct speech.",
    "- Do not place narration inside Japanese quotation marks.",
    "- Provide an accurate English translation of the complete story.",
    "- Return the English translation as one continuous string, not an array.",
  ].join("\n");

  const result = await generateStructured<StoryPassageOutput>({
    name: "story-only draft",
    prompt,
    schema: storySchema,
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
