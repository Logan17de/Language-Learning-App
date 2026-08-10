import "server-only";

import {
  parseCompleteLessonImport,
  validateCompleteLessonImport,
} from "@/lib/admin-complete-lesson-import";
import { COMPLETE_LESSON_CHAT_PROMPT } from "@/lib/admin-complete-lesson-prompt";

export const SUPPORTED_BATCH_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type SupportedBatchLevel = (typeof SUPPORTED_BATCH_LEVELS)[number];

export const TARGET_KANJI_COUNT = 5;
export const TARGET_GRAMMAR_COUNT = 3;
export const MAX_BATCH_LESSONS = 100;

export type JsonRecord = Record<string, unknown>;

function objectSchema(
  properties: Record<string, unknown>,
  required = Object.keys(properties),
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const stringArray = { type: "array", items: { type: "string" } } as const;
const choiceFields = {
  choices: stringArray,
  correctAnswer: { type: "string" },
  explanation: { type: "string" },
} as const;

const kanjiSchema = objectSchema({
  character: { type: "string" },
  reading: { type: "string" },
  meaning: { type: "string" },
});

const grammarSchema = objectSchema({
  id: { type: "string" },
  pattern: { type: "string" },
  meaning: { type: "string" },
  structure: { type: "string" },
  usage: { type: "string" },
  example: { type: "string" },
  translation: { type: "string" },
  commonMistake: { type: "string" },
});

const vocabularySchema = objectSchema({
  term: { type: "string" },
  reading: { type: "string" },
  meaning: { type: "string" },
  partOfSpeech: { type: "string" },
  exampleSentence: { type: "string" },
});

const storyWordSchema = objectSchema({
  surface: { type: "string" },
  reading: { type: "string" },
  meaning: { type: "string" },
  scriptType: { type: "string", enum: ["kanji", "hiragana", "katakana"] },
});

const storyBlockSchema = objectSchema({
  japanese: { type: "string" },
  english: { type: "string" },
  words: { type: "array", items: storyWordSchema },
});

const vocabularyQuestionSchema = objectSchema({
  id: { type: "string" },
  mode: {
    type: "string",
    enum: ["kanji-reading", "reading-meaning", "meaning-japanese", "mixed"],
  },
  modeLabel: { type: "string" },
  difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
  prompt: { type: "string" },
  cue: { type: "string" },
  ...choiceFields,
  acceptedAnswers: stringArray,
  targetRefs: stringArray,
});

const grammarQuestionSchema = objectSchema({
  id: { type: "string" },
  type: {
    type: "string",
    enum: ["multiple-choice", "fill-blank", "sentence-order", "natural-sentence"],
  },
  skill: { type: "string", enum: ["understanding", "production"] },
  difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
  answerMode: { type: "string", enum: ["choice", "text"] },
  prompt: { type: "string" },
  cue: { type: "string" },
  choices: stringArray,
  correctAnswer: { type: "string" },
  acceptedAnswers: stringArray,
  explanation: { type: "string" },
  hintFront: { type: "string" },
  hintBack: { type: "string" },
  targetRefs: stringArray,
});

const speakingSchema = objectSchema({
  id: { type: "string" },
  mode: { type: "string", enum: ["easy", "medium", "hard"] },
  questionType: { type: "string", enum: ["read_aloud"] },
  prompt: { type: "string" },
  modelAnswer: { type: "string" },
  expectedAnswer: { type: "string" },
  targetRefs: stringArray,
});

const readingBlockSchema = objectSchema({
  speaker: { type: "string" },
  japanese: { type: "string" },
  english: { type: "string" },
});

const readingQuestionSchema = objectSchema({
  id: { type: "string" },
  difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
  question: { type: "string" },
  answer: { type: "string" },
});

const listeningSchema = objectSchema({
  id: { type: "string" },
  difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
  prompt: { type: "string" },
  conversationLines: stringArray,
  transcript: { type: "string" },
  ...choiceFields,
  targetRefs: stringArray,
});

const reviewSchema = objectSchema({
  id: { type: "string" },
  questionType: { type: "string", enum: ["multiple-choice"] },
  category: {
    type: "string",
    enum: ["kanji", "vocabulary", "grammar", "listening", "speaking"],
  },
  prompt: { type: "string" },
  ...choiceFields,
  targetRefs: stringArray,
});

/**
 * Structural schema sent to OpenAI Structured Outputs. Exact cardinalities,
 * cross-references, sentence counts, target coverage, and answer correctness
 * remain deterministic application checks in validateGeneratedLesson().
 */
export const COMPLETE_LESSON_BATCH_SCHEMA = objectSchema({
  schemaVersion: { type: "integer", enum: [1] },
  id: { type: "string" },
  title: { type: "string" },
  japaneseTitle: { type: "string" },
  topic: { type: "string" },
  level: { type: "string", enum: [...SUPPORTED_BATCH_LEVELS] },
  durationMinutes: { type: "integer" },
  tags: stringArray,
  summary: { type: "string" },
  storyPreview: { type: "string" },
  kanji: { type: "array", items: kanjiSchema },
  grammar: { type: "array", items: grammarSchema },
  vocabulary: { type: "array", items: vocabularySchema },
  story: { type: "array", items: storyBlockSchema },
  vocabularyQuestions: { type: "array", items: vocabularyQuestionSchema },
  grammarQuestions: { type: "array", items: grammarQuestionSchema },
  speakingExercises: { type: "array", items: speakingSchema },
  readingTitle: { type: "string" },
  readingJapaneseTitle: { type: "string" },
  readingConversation: { type: "array", items: readingBlockSchema },
  readingQuestions: { type: "array", items: readingQuestionSchema },
  listeningExercises: { type: "array", items: listeningSchema },
  reviewQuestions: { type: "array", items: reviewSchema },
});

export function normalizeBatchLevel(value: unknown): SupportedBatchLevel | null {
  return SUPPORTED_BATCH_LEVELS.includes(value as SupportedBatchLevel)
    ? value as SupportedBatchLevel
    : null;
}

export function targetSetSignature(values: string[]): string {
  return [...values]
    .map((value) => value.normalize("NFKC").trim())
    .sort((left, right) => left.localeCompare(right, "ja"))
    .join("\u0000");
}

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function buildLessonPrompt(input: {
  customId: string;
  level: SupportedBatchLevel;
  targetKanji: string[];
  targetGrammar: string[];
}): string {
  const lessonId = `lesson_${input.customId}`;
  const base = COMPLETE_LESSON_CHAT_PROMPT
    .replace(
      "- Topic: <REPLACE_TOPIC>",
      `- Topic: Choose an original, natural ${input.level}-appropriate topic yourself. Make the target kanji and grammar fit the story naturally.`,
    )
    .replace(
      "- JLPT level: <REPLACE_LEVEL: N5|N4|N3|N2|N1>",
      `- JLPT level: ${input.level}`,
    )
    .replace(
      "- Learner interests: <REPLACE_INTERESTS_OR_NONE>",
      "- Learner interests: None; choose the topic independently",
    )
    .replace(
      "- Target kanji: <REPLACE_WITH_EXACTLY_5_KANJI>",
      `- Target kanji: ${input.targetKanji.join("、")}`,
    )
    .replace(
      "- Target grammar: <REPLACE_WITH_EXACTLY_3_GRAMMAR_PATTERNS>",
      `- Target grammar: ${input.targetGrammar.join(" / ")}`,
    );

  return `${base}\n\nBATCH-SPECIFIC REQUIREMENTS\n- Set the top-level id to exactly \"${lessonId}\".\n- Keep the top-level level exactly \"${input.level}\".\n- The top-level kanji array must contain exactly these five focus characters, with no substitutions: ${input.targetKanji.join("、")}.\n- These five characters are focus targets, NOT a whitelist. You may and should combine them into natural words or compounds, and you may use any other kanji that is natural and appropriate for ${input.level}.\n- Do not add supporting/non-target kanji to the top-level kanji array.\n- Each focus kanji must appear naturally in the main Japanese story, either alone or inside a natural word/compound.\n- The top-level grammar array must contain exactly these three target patterns, with no substitutions: ${input.targetGrammar.join(" / ")}.\n- Every target grammar pattern must be tested by at least one grammarQuestions targetRefs entry.\n- Choose the topic yourself. Do not mention these controls or say that a topic was assigned.\n- Prefer a distinctive everyday scenario rather than repeating generic school self-introductions unless the targets genuinely call for it.\n- Keep every Listening transcript below 1,200 characters so stored TTS can be generated.\n- Return only the complete JSON object.`;
}

function targetValidationErrors(
  value: unknown,
  targetKanji: string[],
  targetGrammar: string[],
  level: SupportedBatchLevel,
): string[] {
  if (!record(value)) return ["Generated lesson is not a JSON object."];
  const errors: string[] = [];
  const actualKanji = Array.isArray(value.kanji)
    ? value.kanji
      .map((item) => record(item) ? text(item.character) : null)
      .filter((item): item is string => Boolean(item))
    : [];
  const actualGrammar = Array.isArray(value.grammar)
    ? value.grammar
      .map((item) => record(item) ? text(item.pattern) : null)
      .filter((item): item is string => Boolean(item))
    : [];
  const sameSet = (left: string[], right: string[]) =>
    left.length === right.length && targetSetSignature(left) === targetSetSignature(right);

  if (!sameSet(actualKanji, targetKanji)) {
    errors.push(`Target kanji mismatch. Expected: ${targetKanji.join("、")}.`);
  }
  if (!sameSet(actualGrammar, targetGrammar)) {
    errors.push(`Target grammar mismatch. Expected: ${targetGrammar.join(" / ")}.`);
  }
  if (text(value.level) !== level) {
    errors.push(`Generated lesson level must remain ${level}.`);
  }

  const storyText = Array.isArray(value.story)
    ? value.story
      .map((item) => record(item) ? text(item.japanese) ?? "" : "")
      .join("\n")
    : "";
  for (const character of targetKanji) {
    if (!storyText.includes(character)) {
      errors.push(`Target kanji ${character} is missing from the main story.`);
    }
  }

  const grammarRefs = new Set<string>();
  if (Array.isArray(value.grammarQuestions)) {
    for (const question of value.grammarQuestions) {
      if (!record(question)) continue;
      for (const ref of strings(question.targetRefs)) grammarRefs.add(ref);
    }
  }
  for (const pattern of targetGrammar) {
    if (!grammarRefs.has(`grammar:${pattern}`)) {
      errors.push(`Target grammar ${pattern} is not tested in grammarQuestions.`);
    }
  }

  if (Array.isArray(value.listeningExercises)) {
    value.listeningExercises.forEach((item, index) => {
      if (record(item) && (text(item.transcript)?.length ?? 0) > 1_200) {
        errors.push(`Listening transcript ${index + 1} exceeds the 1,200-character stored-TTS limit.`);
      }
    });
  }
  return errors;
}

export function validateGeneratedLesson(input: {
  value: unknown;
  targetKanji: string[];
  targetGrammar: string[];
  level: SupportedBatchLevel;
}): string[] {
  return [...new Set([
    ...validateCompleteLessonImport(input.value).errors,
    ...targetValidationErrors(
      input.value,
      input.targetKanji,
      input.targetGrammar,
      input.level,
    ),
  ])];
}

export function parseGeneratedLesson(source: string): unknown {
  return parseCompleteLessonImport(source);
}
