import "server-only";

import { storyWordScript } from "@/lib/story-support";
import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  PlayableLessonPackageV2,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type { JLPTLevel } from "@/types/lesson";

export type ActivityGroupName =
  | "vocabulary_and_kanji"
  | "grammar_and_reading"
  | "listening_and_speaking"
  | "final_review";

type Difficulty = "Easy" | "Medium" | "Hard";

export interface ActivityGroupResult<T> {
  value: T;
  audit: GenerationAuditEntry;
}

export interface PracticeQuestion {
  activityType: "multiple_choice" | "text_input";
  difficulty: Difficulty;
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

export interface ReadingLine {
  speaker: string;
  japanese: string;
  english: string;
  targetItemIds: string[];
}

export interface ListeningExercise {
  difficulty: Difficulty;
  prompt: string;
  transcript: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
}

export interface SpeakingExercise {
  mode: "easy" | "medium" | "hard";
  prompt: string;
  easyPrompt: string;
  mediumPrompt: string;
  hardPrompt: string;
  expectedAnswer: string;
  modelAnswer: string;
  targetItemIds: string[];
}

export interface ReviewQuestion {
  category: "kanji" | "vocabulary" | "grammar" | "listening" | "speaking";
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
}

export interface VocabularyKanjiGroup {
  vocabularyQuestions: PracticeQuestion[];
}

export interface GrammarReadingGroup {
  grammarQuestions: PracticeQuestion[];
  readingConversation: ReadingLine[];
}

export interface CommunicationGroup {
  listeningExercises: ListeningExercise[];
  speakingExercises: SpeakingExercise[];
}

export interface ReviewGroup {
  reviewQuestions: ReviewQuestion[];
}

export interface ActivityGroups {
  vocabularyAndKanji: VocabularyKanjiGroup;
  grammarAndReading: GrammarReadingGroup;
  communication: CommunicationGroup;
  review: ReviewGroup;
}

export interface InteractiveStory {
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  lines: Array<{
    japanese: string;
    english: string;
    terms: StoryDraft["lines"][number]["terms"];
    words: InspectableTerm[];
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectArray(minItems: number, maxItems: number, items: JsonSchema): JsonSchema {
  return { type: "array", minItems, maxItems, items };
}

function stringArray(minItems = 0, maxItems = 100): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
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
        enum: phase === "vocabulary"
          ? ["multiple_choice"]
          : ["multiple_choice", "text_input"],
      },
      difficulty: { type: "string", enum: ["Easy", "Medium", "Hard"] },
      mode: {
        type: "string",
        enum: phase === "vocabulary"
          ? ["kanji-reading", "reading-meaning", "meaning-japanese", "mixed"]
          : ["grammar"],
      },
      skill: { type: "string", enum: ["understanding", "production"] },
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

const readingLineSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["speaker", "japanese", "english", "targetItemIds"],
  properties: {
    speaker: { type: "string" },
    japanese: { type: "string" },
    english: { type: "string" },
    targetItemIds: targetIdsSchema,
  },
};

const listeningSchema: JsonSchema = {
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
};

const speakingSchema: JsonSchema = {
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
};

const reviewSchema: JsonSchema = {
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
};

function allowedLibraryIds(library: ResolvedLessonLibrary): Set<string> {
  return new Set([
    ...library.kanji.map((item) => item.libraryId),
    ...library.grammar.map((item) => item.libraryId),
    ...library.vocabulary.map((item) => item.libraryId),
  ]);
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasJapanese(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

function duplicateChoices(choices: string[]): boolean {
  const values = choices.map(normalized);
  return new Set(values).size !== values.length;
}

function difficultyCounts(items: unknown[]): Record<Difficulty, number> {
  const counts: Record<Difficulty, number> = { Easy: 0, Medium: 0, Hard: 0 };
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (item.difficulty === "Easy" || item.difficulty === "Medium" || item.difficulty === "Hard") {
      counts[item.difficulty] += 1;
    }
  }
  return counts;
}

function targetIssues(
  item: Record<string, unknown>,
  label: string,
  allowedIds: Set<string>,
): string[] {
  if (!Array.isArray(item.targetItemIds) || item.targetItemIds.length < 1) {
    return [`${label} needs targetItemIds.`];
  }
  return item.targetItemIds.some(
    (id) => typeof id !== "string" || !allowedIds.has(id),
  )
    ? [`${label} uses an unknown library ID.`]
    : [];
}

function choiceIssues(item: Record<string, unknown>, label: string): string[] {
  if (!Array.isArray(item.choices) || !item.choices.every((choice) => typeof choice === "string")) {
    return [`${label} needs valid choices.`];
  }
  const choices = item.choices as string[];
  const issues: string[] = [];
  if (choices.length > 0 && !choices.includes(item.correctAnswer as string)) {
    issues.push(`${label} omits its correct choice.`);
  }
  if (duplicateChoices(choices)) issues.push(`${label} repeats a choice.`);
  return issues;
}

function practiceIssues(
  value: unknown,
  key: "vocabularyQuestions" | "grammarQuestions",
  library: ResolvedLessonLibrary,
): string[] {
  if (!isRecord(value) || !Array.isArray(value[key]) || value[key].length !== 13) {
    return [`${key} needs exactly 13 items.`];
  }
  const items = value[key] as unknown[];
  const issues: string[] = [];
  const counts = difficultyCounts(items);
  if (counts.Easy !== 6 || counts.Medium !== 4 || counts.Hard !== 3) {
    issues.push(`${key} needs 6 Easy, 4 Medium, and 3 Hard items.`);
  }
  const allowedIds = allowedLibraryIds(library);
  items.forEach((candidate, index) => {
    const label = `${key} item ${index + 1}`;
    if (!isRecord(candidate)) {
      issues.push(`${label} must be an object.`);
      return;
    }
    issues.push(...targetIssues(candidate, label, allowedIds));
    issues.push(...choiceIssues(candidate, label));
    const answer = typeof candidate.correctAnswer === "string"
      ? normalized(candidate.correctAnswer)
      : "";
    const accepted = Array.isArray(candidate.acceptedAnswers)
      ? candidate.acceptedAnswers.filter((item): item is string => typeof item === "string")
      : [];
    if (!answer || accepted.length < 1 || !accepted.some((item) => normalized(item) === answer)) {
      issues.push(`${label} needs acceptedAnswers containing the correct answer.`);
    }
    if (candidate.activityType === "multiple_choice" && (candidate.choices as unknown[]).length !== 4) {
      issues.push(`${label} needs exactly four choices.`);
    }
    if (candidate.activityType === "text_input") {
      if ((candidate.choices as unknown[]).length !== 0) {
        issues.push(`${label} text input must not include choices.`);
      }
      const stem = typeof candidate.hintFront === "string" ? candidate.hintFront.trim() : "";
      if (!stem || !/_{2,}|＿{2,}|…/.test(stem)) {
        issues.push(`${label} needs a visible Japanese sentence stem with a blank in hintFront.`);
      }
      if (answer && normalized(stem).includes(answer)) {
        issues.push(`${label} leaks its answer in hintFront.`);
      }
    }
    if (candidate.skill === "production") {
      const prompt = typeof candidate.prompt === "string" ? candidate.prompt : "";
      const cue = typeof candidate.cue === "string" ? candidate.cue : "";
      if (hasJapanese(prompt) || hasJapanese(cue)) {
        issues.push(`${label} production prompt and cue must be English-only.`);
      }
      if (answer && `${normalized(prompt)} ${normalized(cue)}`.includes(answer)) {
        issues.push(`${label} leaks its answer in the prompt.`);
      }
    }
  });
  return [...new Set(issues)];
}

function readingIssues(value: unknown, library: ResolvedLessonLibrary): string[] {
  if (!isRecord(value) || !Array.isArray(value.readingConversation) || value.readingConversation.length !== 6) {
    return ["readingConversation needs exactly 6 lines."];
  }
  const allowedIds = allowedLibraryIds(library);
  return value.readingConversation.flatMap((candidate, index) => {
    if (!isRecord(candidate)) return [`Reading line ${index + 1} must be an object.`];
    const issues = targetIssues(candidate, `Reading line ${index + 1}`, allowedIds);
    if (typeof candidate.japanese !== "string" || !hasJapanese(candidate.japanese)) {
      issues.push(`Reading line ${index + 1} needs Japanese text.`);
    }
    if (typeof candidate.english !== "string" || !candidate.english.trim()) {
      issues.push(`Reading line ${index + 1} needs an English translation.`);
    }
    return issues;
  });
}

function communicationIssues(value: unknown, library: ResolvedLessonLibrary): string[] {
  if (!isRecord(value)) return ["Communication activities must be an object."];
  const listening = Array.isArray(value.listeningExercises) ? value.listeningExercises : [];
  const speaking = Array.isArray(value.speakingExercises) ? value.speakingExercises : [];
  const issues: string[] = [];
  if (listening.length !== 3) issues.push("Listening needs exactly 3 exercises.");
  if (speaking.length !== 3) issues.push("Speaking needs exactly 3 exercises.");
  const counts = difficultyCounts(listening);
  if (counts.Easy !== 1 || counts.Medium !== 1 || counts.Hard !== 1) {
    issues.push("Listening needs one Easy, one Medium, and one Hard exercise.");
  }
  const modes = speaking.flatMap((item) => isRecord(item) && typeof item.mode === "string" ? [item.mode] : []);
  if (new Set(modes).size !== 3 || !["easy", "medium", "hard"].every((mode) => modes.includes(mode))) {
    issues.push("Speaking needs one easy, one medium, and one hard exercise.");
  }
  const allowedIds = allowedLibraryIds(library);
  listening.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issues.push(`Listening item ${index + 1} must be an object.`);
      return;
    }
    issues.push(...targetIssues(candidate, `Listening item ${index + 1}`, allowedIds));
    issues.push(...choiceIssues(candidate, `Listening item ${index + 1}`));
    if (!Array.isArray(candidate.choices) || candidate.choices.length !== 4) {
      issues.push(`Listening item ${index + 1} needs exactly four choices.`);
    }
  });
  speaking.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issues.push(`Speaking item ${index + 1} must be an object.`);
      return;
    }
    issues.push(...targetIssues(candidate, `Speaking item ${index + 1}`, allowedIds));
    if (typeof candidate.modelAnswer !== "string" || !hasJapanese(candidate.modelAnswer)) {
      issues.push(`Speaking item ${index + 1} needs a Japanese model answer.`);
    }
  });
  return [...new Set(issues)];
}

function reviewIssues(value: unknown, library: ResolvedLessonLibrary): string[] {
  if (!isRecord(value) || !Array.isArray(value.reviewQuestions) || value.reviewQuestions.length !== 5) {
    return ["Review needs exactly 5 questions."];
  }
  const issues: string[] = [];
  const allowedIds = allowedLibraryIds(library);
  const categories: string[] = [];
  value.reviewQuestions.forEach((candidate, index) => {
    if (!isRecord(candidate)) {
      issues.push(`Review item ${index + 1} must be an object.`);
      return;
    }
    if (typeof candidate.category === "string") categories.push(candidate.category);
    issues.push(...targetIssues(candidate, `Review item ${index + 1}`, allowedIds));
    issues.push(...choiceIssues(candidate, `Review item ${index + 1}`));
    if (!Array.isArray(candidate.choices) || candidate.choices.length !== 4) {
      issues.push(`Review item ${index + 1} needs exactly four choices.`);
    }
  });
  const expected = ["kanji", "vocabulary", "grammar", "listening", "speaking"];
  if (new Set(categories).size !== 5 || !expected.every((category) => categories.includes(category))) {
    issues.push("Review needs one question for every lesson skill.");
  }
  return [...new Set(issues)];
}

function context(input: {
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}, include: Array<"kanji" | "vocabulary" | "grammar">): Record<string, unknown> {
  return {
    fixedStory: input.draft.lines,
    ...(include.includes("kanji") ? {
      kanji: input.library.kanji.map((item) => ({
        id: item.libraryId,
        character: item.character,
        readings: item.readings,
        meanings: item.meanings,
      })),
    } : {}),
    ...(include.includes("vocabulary") ? {
      vocabulary: input.library.vocabulary.map((item) => ({
        id: item.libraryId,
        term: item.term,
        reading: item.reading,
        meaning: item.meaning,
        example: item.exampleSentence,
      })),
    } : {}),
    ...(include.includes("grammar") ? {
      grammar: input.library.grammar.map((item) => ({
        id: item.libraryId,
        pattern: item.pattern,
        meaning: item.meaning,
        formation: item.formation,
      })),
    } : {}),
  };
}

async function generateGroup<T>(input: {
  name: string;
  stage: GenerationAuditEntry["stage"];
  prompt: string[];
  schema: JsonSchema;
  validate: (value: unknown) => string[];
}): Promise<ActivityGroupResult<T>> {
  const generated = await generateStructured<T>({
    name: input.name,
    prompt: input.prompt.join("\n"),
    schema: input.schema,
    validate: input.validate,
  });
  return {
    value: generated.value,
    audit: {
      stage: input.stage,
      model: generated.model,
      repaired: generated.repaired,
    },
  };
}

export async function generateVocabularyAndKanjiActivities(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<VocabularyKanjiGroup>> {
  return generateGroup<VocabularyKanjiGroup>({
    name: "vocabulary and kanji activities",
    stage: "vocabulary_activities",
    prompt: [
      "Create only AIko's vocabulary and kanji practice bank for the fixed story.",
      `JLPT ceiling: ${input.level}. Topic: ${input.topic}.`,
      "Return exactly 13 questions: 6 Easy, 4 Medium, 3 Hard.",
      "Use only supplied library IDs and facts. Do not rewrite the story.",
      "Every multiple-choice question needs four distinct choices including the answer.",
      "Keep feedback encouraging, but never praise an incorrect answer.",
      JSON.stringify(context(input, ["kanji", "vocabulary"])),
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["vocabularyQuestions"],
      properties: {
        vocabularyQuestions: objectArray(13, 13, practiceSchema("vocabulary")),
      },
    },
    validate: (value) => practiceIssues(value, "vocabularyQuestions", input.library),
  });
}

export async function generateGrammarAndReadingActivities(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<GrammarReadingGroup>> {
  return generateGroup<GrammarReadingGroup>({
    name: "grammar and reading activities",
    stage: "grammar_reading_activities",
    prompt: [
      "Create only AIko's grammar bank and reading conversation for the fixed story.",
      `JLPT ceiling: ${input.level}. Topic: ${input.topic}.`,
      "Return 13 grammar questions (6 Easy, 4 Medium, 3 Hard) and exactly 6 reading lines.",
      "Use only supplied library IDs and facts. Do not rewrite the story.",
      "Production prompt and cue must be English-only and must never contain the Japanese answer.",
      "For every text-input question, put the visible Japanese sentence beginning in hintFront and replace only the requested ending with ___. The learner must always see enough Japanese context to answer.",
      "Multiple-choice questions need four distinct choices including the answer.",
      "Keep feedback encouraging, but never praise an incorrect answer.",
      JSON.stringify(context(input, ["vocabulary", "grammar"])),
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["grammarQuestions", "readingConversation"],
      properties: {
        grammarQuestions: objectArray(13, 13, practiceSchema("grammar")),
        readingConversation: objectArray(6, 6, readingLineSchema),
      },
    },
    validate: (value) => [
      ...practiceIssues(value, "grammarQuestions", input.library),
      ...readingIssues(value, input.library),
    ],
  });
}

export async function generateListeningAndSpeakingActivities(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<CommunicationGroup>> {
  return generateGroup<CommunicationGroup>({
    name: "listening and interactive speaking activities",
    stage: "communication_activities",
    prompt: [
      "Create only AIko's listening and interactive speaking activities for the fixed story.",
      `JLPT ceiling: ${input.level}. Topic: ${input.topic}.`,
      "Return 3 listening exercises: exactly one Easy, one Medium, and one Hard.",
      "Return 3 speaking exercises: exactly one easy, one medium, and one hard.",
      "Voice belongs here: AIko presents spoken Japanese and the learner responds.",
      "Use only supplied library IDs and facts. Do not rewrite or narrate the story.",
      "Listening choices must be four distinct choices containing the correct answer.",
      JSON.stringify(context(input, ["kanji", "vocabulary", "grammar"])),
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["listeningExercises", "speakingExercises"],
      properties: {
        listeningExercises: objectArray(3, 3, listeningSchema),
        speakingExercises: objectArray(3, 3, speakingSchema),
      },
    },
    validate: (value) => communicationIssues(value, input.library),
  });
}

export async function generateFinalReviewActivities(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<ReviewGroup>> {
  return generateGroup<ReviewGroup>({
    name: "final review activities",
    stage: "review_activities",
    prompt: [
      "Create only AIko's final review for the fixed story and lesson facts.",
      `JLPT ceiling: ${input.level}. Topic: ${input.topic}.`,
      "Return exactly 5 multiple-choice questions: one kanji, one vocabulary, one grammar, one listening, and one speaking.",
      "Use only supplied library IDs and facts. Use four distinct choices containing each answer.",
      "Do not rewrite the story. Never praise an incorrect answer.",
      JSON.stringify(context(input, ["kanji", "vocabulary", "grammar"])),
    ],
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reviewQuestions"],
      properties: {
        reviewQuestions: objectArray(5, 5, reviewSchema),
      },
    },
    validate: (value) => reviewIssues(value, input.library),
  });
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
    .filter((item) => joined.includes(item.character) && !coveredCharacters.has(item.character))
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
  line: StoryDraft["lines"][number],
  library: ResolvedLessonLibrary,
): InspectableTerm[] {
  return line.terms.map((term) => {
    const exact = library.vocabulary.find(
      (item) => item.term === term.surface && item.reading === term.readingHint,
    );
    const matches = library.vocabulary.filter((item) => item.term === term.surface);
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

export function buildInteractiveStory(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
): InteractiveStory {
  return {
    title: draft.title,
    japaneseTitle: draft.japaneseTitle,
    summary: draft.summary,
    storyPreview: draft.storyPreview,
    tags: draft.tags,
    lines: draft.lines.map((line) => ({
      ...line,
      words: storyWords(line, library),
    })),
  };
}

export function assemblePlayableLesson(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  groups: ActivityGroups;
  audit: GenerationAuditEntry[];
}): PlayableLessonPackageV2 {
  const withTerms = (question: PracticeQuestion) => ({
    ...question,
    inspectableTerms: inspectableTerms([question.prompt, question.cue], input.library),
  });
  const unique = <T,>(items: T[]): T[] => [...new Set(items)];
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
    vocabularyQuestions: input.groups.vocabularyAndKanji.vocabularyQuestions.map(withTerms),
    grammarQuestions: input.groups.grammarAndReading.grammarQuestions.map(withTerms),
    readingConversation: input.groups.grammarAndReading.readingConversation.map((line) => ({
      ...line,
      inspectableTerms: inspectableTerms([line.japanese, line.english], input.library),
    })),
    listeningExercises: input.groups.communication.listeningExercises.map((exercise) => ({
      ...exercise,
      inspectableTerms: inspectableTerms([exercise.prompt, exercise.transcript], input.library),
    })),
    speakingExercises: input.groups.communication.speakingExercises.map((exercise) => ({
      ...exercise,
      inspectableTerms: inspectableTerms([
        exercise.prompt,
        exercise.easyPrompt,
        exercise.mediumPrompt,
        exercise.hardPrompt,
        exercise.modelAnswer,
      ], input.library),
    })),
    reviewQuestions: input.groups.review.reviewQuestions,
    generationAudit: { calls: input.audit },
  };
}
