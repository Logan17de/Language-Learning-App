import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { JLPTLevel } from "@/types/lesson";
import { storyLengthRange, storyWordScript } from "@/lib/story-support";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  STORY_CONTENT_PARTS,
  lexicalTermIssues,
} from "@/lib/gemini/story-lexicon-validation";
import { VERB_TYPES } from "@/lib/japanese-lexicon";
import type {
  GenerationAuditEntry,
  LessonPlan,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";

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

function objectArray(minItems: number, maxItems: number, item: JsonSchema): JsonSchema {
  return { type: "array", minItems, maxItems, items: item };
}

function storySchema(level: JLPTLevel): JsonSchema {
  const range = storyLengthRange(level);
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "japaneseTitle", "summary", "storyPreview", "tags", "lines"],
    properties: {
      title: { type: "string" },
      japaneseTitle: { type: "string" },
      summary: { type: "string" },
      storyPreview: { type: "string" },
      tags: stringArray(2, 6),
      lines: objectArray(range.min, range.max, {
        type: "object",
        additionalProperties: false,
        required: ["japanese", "english", "terms"],
        properties: {
          japanese: { type: "string" },
          english: { type: "string" },
          terms: objectArray(1, 10, {
            type: "object",
            additionalProperties: false,
            required: [
              "surface",
              "readingHint",
              "scriptType",
              "dictionaryForm",
              "dictionaryReading",
              "partOfSpeech",
              "conjugationType",
              "dictionaryAlias",
            ],
            properties: {
              surface: { type: "string" },
              readingHint: { type: "string" },
              scriptType: {
                type: "string",
                enum: ["kanji", "hiragana", "katakana"],
              },
              dictionaryForm: { type: "string" },
              dictionaryReading: { type: "string" },
              partOfSpeech: {
                type: "string",
                enum: [...STORY_CONTENT_PARTS],
              },
              conjugationType: {
                type: "string",
                enum: ["", ...VERB_TYPES],
              },
              dictionaryAlias: { type: "string" },
            },
          }),
        },
      }),
    },
  };
}

function structuralStoryIssues(value: unknown, plan: LessonPlan, level: JLPTLevel): string[] {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return ["Story must contain lines."];
  }
  const range = storyLengthRange(level);
  const issues: string[] = [];
  if (value.lines.length < range.min || value.lines.length > range.max) {
    issues.push(`Story needs ${range.min}-${range.max} lines.`);
  }

  const allowedKanji = new Set([
    ...plan.kanji.map((item) => item.character),
    ...plan.knownKanji,
  ]);
  const storyText = value.lines
    .flatMap((line) => isRecord(line) && typeof line.japanese === "string" ? [line.japanese] : [])
    .join("");
  for (const target of plan.kanji) {
    if (!storyText.includes(target.character)) {
      issues.push(`Story does not use target kanji ${target.character}.`);
    }
  }

  for (const [lineIndex, line] of value.lines.entries()) {
    if (!isRecord(line) || !stringValue(line.japanese) || !stringValue(line.english) || !Array.isArray(line.terms)) {
      issues.push(`Story line ${lineIndex + 1} is incomplete.`);
      continue;
    }
    let cursor = 0;
    const coveredKanji = new Set<string>();
    for (const [termIndex, term] of line.terms.entries()) {
      if (!isRecord(term) || !stringValue(term.surface) || !stringValue(term.readingHint)) {
        issues.push(`Story line ${lineIndex + 1}, term ${termIndex + 1} is incomplete.`);
        continue;
      }
      const label = `Story line ${lineIndex + 1}, term ${termIndex + 1}`;
      issues.push(
        ...lexicalTermIssues(
          term as unknown as StoryDraft["lines"][number]["terms"][number],
          label,
        ),
      );
      const position = line.japanese.indexOf(term.surface, cursor);
      if (position < 0) {
        issues.push(`Term ${term.surface} is missing or out of order in line ${lineIndex + 1}.`);
      } else {
        cursor = position + term.surface.length;
      }
      if (term.scriptType !== storyWordScript(term.surface)) {
        issues.push(`Term ${term.surface} has the wrong script type.`);
      }
      for (const character of term.surface.match(/\p{Script=Han}/gu) ?? []) {
        coveredKanji.add(character);
      }
    }
    for (const character of line.japanese.match(/\p{Script=Han}/gu) ?? []) {
      if (!allowedKanji.has(character)) issues.push(`Story uses unplanned kanji ${character}.`);
      if (!coveredKanji.has(character)) issues.push(`Kanji ${character} is not covered by a tappable word.`);
    }
  }

  const terms = unique(
    value.lines.flatMap((line) =>
      isRecord(line) && Array.isArray(line.terms)
        ? line.terms.flatMap((term) =>
            isRecord(term) && stringValue(term.surface)
              ? [`${term.surface}:${String(term.readingHint ?? "")}`]
              : [],
          )
        : [],
    ),
  );
  if (terms.length < 8 || terms.length > 40) {
    issues.push("Story must reuse a focused set of 8-40 tappable words.");
  }
  return unique(issues);
}

type GrammarDecision = {
  equivalent: boolean;
  matchedPattern: string;
  confidence: number;
};

const grammarDecisionSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["equivalent", "matchedPattern", "confidence"],
  properties: {
    equivalent: { type: "boolean" },
    matchedPattern: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

async function acceptedAliases(patterns: string[]): Promise<Map<string, string[]>> {
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
        ? row.accepted_patterns.filter((item): item is string => typeof item === "string")
        : [],
    ]),
  );
}

async function confirmAndLearnGrammar(story: StoryDraft, plan: LessonPlan): Promise<void> {
  const storyText = story.lines.map((line) => line.japanese).join("\n");
  const aliases = await acceptedAliases(plan.grammar.map((item) => item.pattern));
  const admin = createAdminClient() as unknown as SupabaseClient;

  for (const target of plan.grammar) {
    const knownForms = [target.pattern, ...(aliases.get(target.pattern) ?? [])];
    if (knownForms.some((form) => storyUsesGrammarPattern(storyText, form))) continue;

    const decision = await generateStructured<GrammarDecision>({
      name: "grammar equivalence decision",
      prompt: [
        "Act as a strict Japanese grammar validator.",
        `Canonical grammar pattern: ${target.pattern}`,
        "Decide whether the story naturally uses the same grammatical construction in an inflected, polite, contracted, or conversational form.",
        "Do not accept a merely related meaning. The underlying grammar construction must be the same.",
        "matchedPattern must be a reusable generalized grammar pattern such as まだ～ていません, not a full sentence and not a one-off phrase.",
        "Set confidence below 0.95 whenever uncertain.",
        "Story:",
        storyText,
      ].join("\n"),
      schema: grammarDecisionSchema,
      validate: (value) => {
        if (!isRecord(value)) return ["Decision must be an object."];
        const issues: string[] = [];
        if (typeof value.equivalent !== "boolean") issues.push("equivalent must be boolean.");
        if (!stringValue(value.matchedPattern)) issues.push("matchedPattern is required.");
        if (typeof value.confidence !== "number" || value.confidence < 0 || value.confidence > 1) {
          issues.push("confidence must be between 0 and 1.");
        }
        return issues;
      },
    });

    if (!decision.value.equivalent || decision.value.confidence < 0.95) {
      throw new Error(`Story does not use grammar ${target.pattern}.`);
    }

    const alias = decision.value.matchedPattern.normalize("NFKC").trim();
    if (!alias || alias.length > 120) {
      throw new Error(`Story does not use grammar ${target.pattern}.`);
    }

    const learned = await admin.rpc("learn_grammar_pattern_alias", {
      p_canonical_pattern: target.pattern,
      p_alias: alias,
      p_confidence: decision.value.confidence,
    });
    if (learned.error) throw new Error(learned.error.message);
  }
}

export async function generateAdaptiveStoryDraft(input: {
  topic: string;
  level: JLPTLevel;
  plan: LessonPlan;
}): Promise<{ draft: StoryDraft; audit: GenerationAuditEntry }> {
  const range = storyLengthRange(input.level);
  const prompt = [
    "Create one coherent Japanese learning story for AIko.",
    `Topic: ${input.topic}`,
    `JLPT ceiling: ${input.level}`,
    `Length: ${range.min}-${range.max} short lines.`,
    `Target kanji: ${input.plan.kanji.map((item) => item.character).join("、")}`,
    `Target grammar: ${input.plan.grammar.map((item) => item.pattern).join("、")}`,
    `Other allowed kanji already known by the learner: ${input.plan.knownKanji.join("、") || "none"}`,
    "Use every target naturally. Inflected, polite, contracted, and conversational forms are allowed when they preserve the same grammar construction.",
    "Write all other words in kana.",
    "Keep the voice warm and encouraging; do not mention scores or AI.",
    "For each line list tappable content words in exact occurrence order.",
    "Reuse a focused vocabulary set. Exclude punctuation, standalone particles, and standalone auxiliaries.",
    "For every term, surface is the exact text in the sentence and readingHint is the kana reading of that exact observed surface.",
    "Also return dictionaryForm, dictionaryReading, partOfSpeech, conjugationType, and dictionaryAlias for the permanent word library.",
    "dictionaryReading is the kana reading of dictionaryForm, not the inflected surface.",
    "Verbs must use the exact conjugation class. Non-verbs must use an empty conjugationType.",
    "dictionaryAlias must be empty unless the observed word uses a genuine alternate dictionary spelling of the same lemma, such as 友だち for 友達. Never use a synonym, related word, or conjugated form as an alias.",
    "Supported morphology includes ordinary polite/casual forms, ている, potential, passive, causative, ～たい, ～てしまう/ちゃう/じゃう, and なければ/なきゃ.",
    "Do not put furigana inside the Japanese line.",
  ].join("\n");

  const result = await generateStructured<StoryDraft>({
    name: "story",
    prompt,
    schema: storySchema(input.level),
    validate: (value) => structuralStoryIssues(value, input.plan, input.level),
  });
  await confirmAndLearnGrammar(result.value, input.plan);

  return {
    draft: result.value,
    audit: {
      stage: "story",
      model: result.model,
      repaired: result.repaired,
    },
  };
}
