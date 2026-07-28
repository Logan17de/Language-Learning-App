import "server-only";

import type { JLPTLevel } from "@/types/lesson";
import { storyLengthRange, storyWordScript } from "@/lib/story-support";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";

export interface PlannedKanji {
  character: string;
  level: JLPTLevel;
}

export interface PlannedGrammar {
  pattern: string;
  level: JLPTLevel;
}

export interface LessonPlan {
  kanji: PlannedKanji[];
  grammar: PlannedGrammar[];
  knownKanji: string[];
}

export interface DraftTerm {
  surface: string;
  readingHint: string;
  scriptType: "kanji" | "hiragana" | "katakana";
}

export interface StoryDraftLine {
  japanese: string;
  english: string;
  terms: DraftTerm[];
}

export interface StoryDraft {
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  lines: StoryDraftLine[];
}

export interface MissingVocabulary {
  writtenForm: string;
  readingHint: string;
  contextJapanese: string;
  contextEnglish: string;
}

export interface LibraryEnrichmentRequest {
  level: JLPTLevel;
  topic: string;
  kanji: string[];
  allowedKanji: string[];
  grammar: string[];
  vocabulary: MissingVocabulary[];
}

export interface LibrarySeedKanji {
  character: string;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

export interface LibrarySeedGrammar {
  pattern: string;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  exampleSentences: string[];
}

export interface LibrarySeedVocabulary {
  writtenForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  tags: string[];
  exampleSentence: string;
  linkedKanjiCharacters: string[];
}

export interface LibrarySeed {
  kanji: LibrarySeedKanji[];
  grammar: LibrarySeedGrammar[];
  vocabulary: LibrarySeedVocabulary[];
}

export interface CanonicalKanji {
  libraryId: string;
  character: string;
  level: JLPTLevel;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

export interface CanonicalGrammar {
  libraryId: string;
  pattern: string;
  level: JLPTLevel;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  examples: string[];
}

export interface CanonicalVocabulary {
  libraryId: string;
  term: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  level: JLPTLevel;
  tags: string[];
  exampleSentence: string;
  linkedKanjiIds: string[];
}

export interface ResolvedLessonLibrary {
  kanji: CanonicalKanji[];
  grammar: CanonicalGrammar[];
  vocabulary: CanonicalVocabulary[];
}

export interface GenerationAuditEntry {
  stage:\n    | "story"\n    | "library"\n    | "activities"\n    | "vocabulary_activities"\n    | "grammar_reading_activities"\n    | "communication_activities"\n    | "review_activities"\n    | "lesson_assembly"\n    | "audio";
  model: string;
  repaired: boolean;
}

interface RawPracticeQuestion {
  activityType: "multiple_choice" | "text_input";
  difficulty: "Easy" | "Medium" | "Hard";
  mode: string;
  skill: "understanding" | "production";
  prompt: string;
  cue: string;
  choices: string[];
  correctAnswer: string;
  acceptedAnswers: string[];
  explanation: string;
  hintFront: string;
  hintBack: string;
  targetItemIds: string[];
}

interface RawReadingLine {
  speaker: string;
  japanese: string;
  english: string;
  targetItemIds: string[];
}

interface RawListeningExercise {
  difficulty: "Easy" | "Medium" | "Hard";
  prompt: string;
  transcript: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
}

interface RawSpeakingExercise {
  mode: "easy" | "medium" | "hard";
  prompt: string;
  easyPrompt: string;
  mediumPrompt: string;
  hardPrompt: string;
  expectedAnswer: string;
  modelAnswer: string;
  targetItemIds: string[];
}

interface RawReviewQuestion {
  category: "kanji" | "vocabulary" | "grammar" | "listening" | "speaking";
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
}

interface RawActivities {
  vocabularyQuestions: RawPracticeQuestion[];
  grammarQuestions: RawPracticeQuestion[];
  readingConversation: RawReadingLine[];
  listeningExercises: RawListeningExercise[];
  speakingExercises: RawSpeakingExercise[];
  reviewQuestions: RawReviewQuestion[];
}

export interface InspectableTerm {
  libraryId: string;
  libraryType: "kanji" | "vocabulary";
  surface: string;
  reading: string;
  meaning: string;
  scriptType: "kanji" | "hiragana" | "katakana";
}

export interface PlayablePracticeQuestion extends RawPracticeQuestion {
  inspectableTerms: InspectableTerm[];
}

export interface PlayableLessonPackageV2 {
  schemaVersion: 2;
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  kanji: Array<{
    libraryId: string;
    character: string;
    reading: string;
    meaning: string;
  }>;
  vocabulary: CanonicalVocabulary[];
  grammar: Array<{
    libraryId: string;
    pattern: string;
    meaning: string;
    structure: string;
    usage: string;
    example: string;
    translation: string;
    commonMistake: string;
  }>;
  story: Array<{
    japanese: string;
    english: string;
    words: InspectableTerm[];
  }>;
  vocabularyQuestions: PlayablePracticeQuestion[];
  grammarQuestions: PlayablePracticeQuestion[];
  readingConversation: Array<
    RawReadingLine & { inspectableTerms: InspectableTerm[] }
  >;
  listeningExercises: Array<
    RawListeningExercise & { inspectableTerms: InspectableTerm[] }
  >;
  speakingExercises: Array<
    RawSpeakingExercise & { inspectableTerms: InspectableTerm[] }
  >;
  reviewQuestions: RawReviewQuestion[];
  generationAudit: {
    calls: GenerationAuditEntry[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(minItems = 0, maxItems = 100): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
  };
}

function objectArray(
  minItems: number,
  maxItems: number,
  item: JsonSchema,
): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: item,
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function storySchema(level: JLPTLevel): JsonSchema {
  const range = storyLengthRange(level);
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "japaneseTitle",
      "summary",
      "storyPreview",
      "tags",
      "lines",
    ],
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
            required: ["surface", "readingHint", "scriptType"],
            properties: {
              surface: { type: "string" },
              readingHint: { type: "string" },
              scriptType: {
                type: "string",
                enum: ["kanji", "hiragana", "katakana"],
              },
            },
          }),
        },
      }),
    },
  };
}

function storyIssues(
  value: unknown,
  plan: LessonPlan,
  level: JLPTLevel,
): string[] {
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
    .flatMap((line) =>
      isRecord(line) && typeof line.japanese === "string"
        ? [line.japanese]
        : [],
    )
    .join("");
  for (const target of plan.kanji) {
    if (!storyText.includes(target.character)) {
      issues.push(`Story does not use target kanji ${target.character}.`);
    }
  }
  for (const target of plan.grammar) {
    if (!storyUsesGrammarPattern(storyText, target.pattern)) {
      issues.push(`Story does not use grammar ${target.pattern}.`);
    }
  }

  for (const [lineIndex, line] of value.lines.entries()) {
    if (
      !isRecord(line) ||
      !stringValue(line.japanese) ||
      !stringValue(line.english) ||
      !Array.isArray(line.terms)
    ) {
      issues.push(`Story line ${lineIndex + 1} is incomplete.`);
      continue;
    }
    let cursor = 0;
    const coveredKanji = new Set<string>();
    for (const [termIndex, term] of line.terms.entries()) {
      if (
        !isRecord(term) ||
        !stringValue(term.surface) ||
        !stringValue(term.readingHint)
      ) {
        issues.push(
          `Story line ${lineIndex + 1}, term ${termIndex + 1} is incomplete.`,
        );
        continue;
      }
      const position = line.japanese.indexOf(term.surface, cursor);
      if (position < 0) {
        issues.push(
          `Term ${term.surface} is missing or out of order in line ${lineIndex + 1}.`,
        );
      } else {
        cursor = position + term.surface.length;
      }
      const expectedScript = storyWordScript(term.surface);
      if (term.scriptType !== expectedScript) {
        issues.push(`Term ${term.surface} has the wrong script type.`);
      }
      for (const character of term.surface.match(/\p{Script=Han}/gu) ?? []) {
        coveredKanji.add(character);
      }
    }
    for (const character of line.japanese.match(/\p{Script=Han}/gu) ?? []) {
      if (!allowedKanji.has(character)) {
        issues.push(`Story uses unplanned kanji ${character}.`);
      }
      if (!coveredKanji.has(character)) {
        issues.push(`Kanji ${character} is not covered by a tappable word.`);
      }
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
    issues.push(`Story must reuse a focused set of 8-40 tappable words.`);
  }
  return unique(issues);
}

export async function generateStoryDraft(input: {
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
    "Use every target naturally. Write all other words in kana.",
    "Keep the voice warm and encouraging; do not mention scores or AI.",
    "For each line list tappable content words in exact occurrence order.",
    "Reuse a focused vocabulary set. Exclude punctuation and standalone particles.",
    "readingHint is kana only. Do not put furigana inside the Japanese line.",
  ].join("\n");
  const result = await generateStructured<StoryDraft>({
    name: "story",
    prompt,
    schema: storySchema(input.level),
    validate: (value) => storyIssues(value, input.plan, input.level),
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

function librarySchema(request: LibraryEnrichmentRequest): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["kanji", "grammar", "vocabulary"],
    properties: {
      kanji: objectArray(request.kanji.length, request.kanji.length, {
        type: "object",
        additionalProperties: false,
        required: [
          "character",
          "meanings",
          "readings",
          "onyomi",
          "kunyomi",
          "exampleWords",
          "strokeCount",
        ],
        properties: {
          character: { type: "string" },
          meanings: stringArray(1, 5),
          readings: stringArray(1, 10),
          onyomi: stringArray(0, 8),
          kunyomi: stringArray(0, 8),
          exampleWords: stringArray(2, 6),
          strokeCount: { type: "integer", minimum: 1, maximum: 64 },
        },
      }),
      grammar: objectArray(request.grammar.length, request.grammar.length, {
        type: "object",
        additionalProperties: false,
        required: [
          "pattern",
          "meaning",
          "formation",
          "usageNotes",
          "nuance",
          "exampleSentences",
        ],
        properties: {
          pattern: { type: "string" },
          meaning: { type: "string" },
          formation: { type: "string" },
          usageNotes: { type: "string" },
          nuance: { type: "string" },
          exampleSentences: stringArray(2, 5),
        },
      }),
      vocabulary: objectArray(
        request.vocabulary.length,
        request.vocabulary.length,
        {
          type: "object",
          additionalProperties: false,
          required: [
            "writtenForm",
            "reading",
            "meaning",
            "partOfSpeech",
            "tags",
            "exampleSentence",
            "linkedKanjiCharacters",
          ],
          properties: {
            writtenForm: { type: "string" },
            reading: { type: "string" },
            meaning: { type: "string" },
            partOfSpeech: { type: "string" },
            tags: stringArray(1, 6),
            exampleSentence: { type: "string" },
            linkedKanjiCharacters: stringArray(0, 8),
          },
        },
      ),
    },
  };
}

function sameSet(actual: string[], expected: string[]): boolean {
  const left = unique(actual).sort();
  const right = unique(expected).sort();
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function libraryIssues(
  value: unknown,
  request: LibraryEnrichmentRequest,
): string[] {
  if (
    !isRecord(value) ||
    !Array.isArray(value.kanji) ||
    !Array.isArray(value.grammar) ||
    !Array.isArray(value.vocabulary)
  ) {
    return ["Library response is incomplete."];
  }
  const issues: string[] = [];
  const kanji = value.kanji.flatMap((item) =>
    isRecord(item) && stringValue(item.character) ? [item.character] : [],
  );
  const grammar = value.grammar.flatMap((item) =>
    isRecord(item) && stringValue(item.pattern) ? [item.pattern] : [],
  );
  const vocabulary = value.vocabulary.flatMap((item) =>
    isRecord(item) && stringValue(item.writtenForm) ? [item.writtenForm] : [],
  );
  if (!sameSet(kanji, request.kanji)) {
    issues.push("Kanji output must exactly match the requested characters.");
  }
  if (!sameSet(grammar, request.grammar)) {
    issues.push("Grammar output must exactly match the requested patterns.");
  }
  if (
    !sameSet(
      vocabulary,
      request.vocabulary.map((item) => item.writtenForm),
    )
  ) {
    issues.push("Vocabulary output must exactly match the requested words.");
  }
  for (const item of value.vocabulary) {
    if (!isRecord(item)) continue;
    const linked = Array.isArray(item.linkedKanjiCharacters)
      ? item.linkedKanjiCharacters.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [];
    if (linked.some((character) => !request.allowedKanji.includes(character))) {
      issues.push(
        `Vocabulary ${String(item.writtenForm)} links an unrequested kanji.`,
      );
    }
  }
  return unique(issues);
}

export async function generateLibraryEnrichment(
  request: LibraryEnrichmentRequest,
): Promise<{
  seed: LibrarySeed;
  model: string;
  audit: GenerationAuditEntry;
}> {
  const prompt = [
    "Fill only these missing records in AIko's permanent Japanese library.",
    `JLPT ceiling: ${request.level}`,
    `Topic context: ${request.topic}`,
    `Kanji: ${JSON.stringify(request.kanji)}`,
    `Allowed linked kanji: ${JSON.stringify(request.allowedKanji)}`,
    `Grammar: ${JSON.stringify(request.grammar)}`,
    `Vocabulary with context: ${JSON.stringify(request.vocabulary)}`,
    "Return every requested record exactly once and no extra records.",
    "Use kana readings, concise English meanings, and natural Japanese examples.",
    "linkedKanjiCharacters may contain only requested kanji that occur in the word.",
  ].join("\n");
  const result = await generateStructured<LibrarySeed>({
    name: "library enrichment",
    prompt,
    schema: librarySchema(request),
    validate: (value) => libraryIssues(value, request),
  });
  return {
    seed: result.value,
    model: result.model,
    audit: {
      stage: "library",
      model: result.model,
      repaired: result.repaired,
    },
  };
}

const targetIdsSchema = stringArray(1, 5);

function practiceSchema(phase: "vocabulary" | "grammar"): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "activityType",
      "difficulty",
      "mode",
      "skill",
      "prompt",
      "cue",
      "choices",
      "correctAnswer",
      "acceptedAnswers",
      "explanation",
      "hintFront",
      "hintBack",
      "targetItemIds",
    ],
    properties: {
      activityType: {
        type: "string",
        enum:
          phase === "vocabulary"
            ? ["multiple_choice"]
            : ["multiple_choice", "text_input"],
      },
      difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
      mode: {
        type: "string",
        enum:
          phase === "vocabulary"
            ? ["kanji-reading", "reading-meaning", "meaning-japanese", "mixed"]
            : ["grammar"],
      },
      skill: {
        type: "string",
        enum: ["understanding", "production"],
      },
      prompt: { type: "string" },
      cue: { type: "string" },
      choices: stringArray(0, 4),
      correctAnswer: { type: "string" },
      acceptedAnswers: stringArray(1, 5),
      explanation: { type: "string" },
      hintFront: { type: "string" },
      hintBack: { type: "string" },
      targetItemIds: targetIdsSchema,
    },
  };
}

function activitiesSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "vocabularyQuestions",
      "grammarQuestions",
      "readingConversation",
      "listeningExercises",
      "speakingExercises",
      "reviewQuestions",
    ],
    properties: {
      vocabularyQuestions: objectArray(13, 13, practiceSchema("vocabulary")),
      grammarQuestions: objectArray(13, 13, practiceSchema("grammar")),
      readingConversation: objectArray(6, 6, {
        type: "object",
        additionalProperties: false,
        required: ["speaker", "japanese", "english", "targetItemIds"],
        properties: {
          speaker: { type: "string" },
          japanese: { type: "string" },
          english: { type: "string" },
          targetItemIds: targetIdsSchema,
        },
      }),
      listeningExercises: objectArray(3, 3, {
        type: "object",
        additionalProperties: false,
        required: [
          "difficulty",
          "prompt",
          "transcript",
          "choices",
          "correctAnswer",
          "explanation",
          "targetItemIds",
        ],
        properties: {
          difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
          prompt: { type: "string" },
          transcript: { type: "string" },
          choices: stringArray(4, 4),
          correctAnswer: { type: "string" },
          explanation: { type: "string" },
          targetItemIds: targetIdsSchema,
        },
      }),
      speakingExercises: objectArray(3, 3, {
        type: "object",
        additionalProperties: false,
        required: [
          "mode",
          "prompt",
          "easyPrompt",
          "mediumPrompt",
          "hardPrompt",
          "expectedAnswer",
          "modelAnswer",
          "targetItemIds",
        ],
        properties: {
          mode: { type: "string", enum: ["easy", "medium", "hard"] },
          prompt: { type: "string" },
          easyPrompt: { type: "string" },
          mediumPrompt: { type: "string" },
          hardPrompt: { type: "string" },
          expectedAnswer: { type: "string" },
          modelAnswer: { type: "string" },
          targetItemIds: targetIdsSchema,
        },
      }),
      reviewQuestions: objectArray(5, 5, {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "prompt",
          "choices",
          "correctAnswer",
          "explanation",
          "targetItemIds",
        ],
        properties: {
          category: {
            type: "string",
            enum: ["kanji", "vocabulary", "grammar", "listening", "speaking"],
          },
          prompt: { type: "string" },
          choices: stringArray(4, 4),
          correctAnswer: { type: "string" },
          explanation: { type: "string" },
          targetItemIds: targetIdsSchema,
        },
      }),
    },
  };
}

function activitiesIssues(
  value: unknown,
  library: ResolvedLessonLibrary,
): string[] {
  if (!isRecord(value)) return ["Activities must be an object."];
  const issues: string[] = [];
  const allowedIds = new Set([
    ...library.kanji.map((item) => item.libraryId),
    ...library.grammar.map((item) => item.libraryId),
    ...library.vocabulary.map((item) => item.libraryId),
  ]);
  const expectedCounts: Record<string, number> = {
    vocabularyQuestions: 13,
    grammarQuestions: 13,
    readingConversation: 6,
    listeningExercises: 3,
    speakingExercises: 3,
    reviewQuestions: 5,
  };
  for (const [key, count] of Object.entries(expectedCounts)) {
    const items = value[key];
    if (!Array.isArray(items) || items.length !== count) {
      issues.push(`${key} needs exactly ${count} items.`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (!isRecord(item) || !Array.isArray(item.targetItemIds)) {
        issues.push(`${key} item ${index + 1} needs targetItemIds.`);
        continue;
      }
      if (
        item.targetItemIds.some(
          (id) => typeof id !== "string" || !allowedIds.has(id),
        )
      ) {
        issues.push(`${key} item ${index + 1} uses an unknown library ID.`);
      }
      if (
        Array.isArray(item.choices) &&
        item.choices.length > 0 &&
        !item.choices.includes(item.correctAnswer)
      ) {
        issues.push(`${key} item ${index + 1} omits its correct choice.`);
      }
    }
  }
  for (const key of ["vocabularyQuestions", "grammarQuestions"]) {
    const items = value[key];
    if (!Array.isArray(items)) continue;
    const counts = difficultyCounts(items);
    if (counts.Easy !== 6 || counts.Medium !== 4 || counts.Hard !== 3) {
      issues.push(
        `${key} needs a 6 Easy / 4 Medium / 3 Hard adaptive bank.`,
      );
    }
  }
  const listening = value.listeningExercises;
  if (Array.isArray(listening)) {
    const counts = difficultyCounts(listening);
    if (counts.Easy !== 1 || counts.Medium !== 1 || counts.Hard !== 1) {
      issues.push("Listening needs one Easy, one Medium, and one Hard item.");
    }
  }
  const review = Array.isArray(value.reviewQuestions)
    ? value.reviewQuestions
    : [];
  const categories = review.flatMap((item) =>
    isRecord(item) && typeof item.category === "string" ? [item.category] : [],
  );
  if (
    !sameSet(categories, [
      "kanji",
      "vocabulary",
      "grammar",
      "listening",
      "speaking",
    ])
  ) {
    issues.push("Review needs one question for each lesson skill.");
  }
  return unique(issues);
}

function difficultyCounts(items: unknown[]): Record<
  "Easy" | "Medium" | "Hard",
  number
> {
  const counts = { Easy: 0, Medium: 0, Hard: 0 };
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (
      item.difficulty === "Easy" ||
      item.difficulty === "Medium" ||
      item.difficulty === "Hard"
    ) {
      counts[item.difficulty] += 1;
    }
  }
  return counts;
}

function inspectableTerms(
  texts: string[],
  library: ResolvedLessonLibrary,
): InspectableTerm[] {
  const joined = texts.join("\n");
  const vocabulary = library.vocabulary
    .filter((item) => joined.includes(item.term))
    .map((item) => ({
      libraryId: item.libraryId,
      libraryType: "vocabulary" as const,
      surface: item.term,
      reading: item.reading,
      meaning: item.meaning,
      scriptType: storyWordScript(item.term),
    }));
  const coveredCharacters = new Set(
    vocabulary.flatMap((item) => item.surface.match(/\p{Script=Han}/gu) ?? []),
  );
  const kanji = library.kanji
    .filter(
      (item) =>
        joined.includes(item.character) &&
        !coveredCharacters.has(item.character),
    )
    .map((item) => ({
      libraryId: item.libraryId,
      libraryType: "kanji" as const,
      surface: item.character,
      reading: item.readings[0] ?? item.character,
      meaning: item.meanings[0] ?? item.character,
      scriptType: "kanji" as const,
    }));
  return [...vocabulary, ...kanji];
}

function storyWords(
  line: StoryDraftLine,
  library: ResolvedLessonLibrary,
): InspectableTerm[] {
  return line.terms.map((term) => {
    const exact = library.vocabulary.find(
      (item) => item.term === term.surface && item.reading === term.readingHint,
    );
    const matches = library.vocabulary.filter(
      (item) => item.term === term.surface,
    );
    const vocabulary = exact ?? (matches.length === 1 ? matches[0] : null);
    if (!vocabulary) {
      throw new Error(`Library record missing for story word ${term.surface}.`);
    }
    return {
      libraryId: vocabulary.libraryId,
      libraryType: "vocabulary",
      surface: vocabulary.term,
      reading: vocabulary.reading,
      meaning: vocabulary.meaning,
      scriptType: storyWordScript(vocabulary.term),
    };
  });
}

export async function generatePlayableLesson(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  audit: GenerationAuditEntry[];
}): Promise<PlayableLessonPackageV2> {
  const generationContext = {
    story: input.draft.lines,
    kanji: input.library.kanji.map((item) => ({
      id: item.libraryId,
      character: item.character,
      readings: item.readings,
      meanings: item.meanings,
    })),
    vocabulary: input.library.vocabulary.map((item) => ({
      id: item.libraryId,
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
      example: item.exampleSentence,
    })),
    grammar: input.library.grammar.map((item) => ({
      id: item.libraryId,
      pattern: item.pattern,
      meaning: item.meaning,
      formation: item.formation,
    })),
  };
  const prompt = [
    "Create the playable activities for this AIko Japanese story.",
    `JLPT ceiling: ${input.level}`,
    `Topic: ${input.topic}`,
    "Use only the supplied library IDs and facts.",
    "Create a 13-item bank for vocabulary and grammar: exactly 6 Easy, 4 Medium, and 3 Hard.",
    "The player will adaptively serve exactly 10 questions from each bank.",
    "Create 6 reading lines,",
    "3 listening questions, 3 speaking tasks, and 5 final review questions.",
    "Listening must contain exactly one Easy, one Medium, and one Hard question.",
    "Feedback must be encouraging but must never praise an incorrect answer.",
    "Multiple-choice items need four distinct choices including the answer.",
    "Text-input items need accepted answers. Production prompts must contain English only.",
    "Never place the Japanese model answer, a partial Japanese answer, or answer blanks in a prompt or cue.",
    "Review must include one each: kanji, vocabulary, grammar, listening, speaking.",
    JSON.stringify(generationContext),
  ].join("\n");
  const result = await generateStructured<RawActivities>({
    name: "playable activities",
    prompt,
    schema: activitiesSchema(),
    validate: (value) => activitiesIssues(value, input.library),
  });
  const activities = result.value;
  const withTerms = (
    question: RawPracticeQuestion,
  ): PlayablePracticeQuestion => ({
    ...question,
    inspectableTerms: inspectableTerms(
      [question.prompt, question.cue],
      input.library,
    ),
  });
  const calls = [
    ...input.audit,
    {
      stage: "activities" as const,
      model: result.model,
      repaired: result.repaired,
    },
  ];

  return {
    schemaVersion: 2,
    title: input.draft.title,
    japaneseTitle: input.draft.japaneseTitle,
    summary: input.draft.summary,
    storyPreview: input.draft.storyPreview,
    tags: unique([input.level, input.topic, ...input.draft.tags]).slice(0, 8),
    kanji: input.library.kanji.map((item) => ({
      libraryId: item.libraryId,
      character: item.character,
      reading: item.readings[0] ?? item.character,
      meaning: item.meanings[0] ?? item.character,
    })),
    vocabulary: input.library.vocabulary,
    grammar: input.library.grammar.map((item) => ({
      libraryId: item.libraryId,
      pattern: item.pattern,
      meaning: item.meaning,
      structure: item.formation,
      usage: item.usageNotes,
      example: item.examples[0] ?? "",
      translation: item.nuance || item.meaning,
      commonMistake: "",
    })),
    story: input.draft.lines.map((line) => ({
      japanese: line.japanese,
      english: line.english,
      words: storyWords(line, input.library),
    })),
    vocabularyQuestions: activities.vocabularyQuestions.map(withTerms),
    grammarQuestions: activities.grammarQuestions.map(withTerms),
    readingConversation: activities.readingConversation.map((line) => ({
      ...line,
      inspectableTerms: inspectableTerms(
        [line.japanese, line.english],
        input.library,
      ),
    })),
    listeningExercises: activities.listeningExercises.map((exercise) => ({
      ...exercise,
      inspectableTerms: inspectableTerms(
        [exercise.prompt, exercise.transcript],
        input.library,
      ),
    })),
    speakingExercises: activities.speakingExercises.map((exercise) => ({
      ...exercise,
      inspectableTerms: inspectableTerms(
        [
          exercise.prompt,
          exercise.easyPrompt,
          exercise.mediumPrompt,
          exercise.hardPrompt,
          exercise.modelAnswer,
        ],
        input.library,
      ),
    })),
    reviewQuestions: activities.reviewQuestions,
    generationAudit: { calls },
  };
}
