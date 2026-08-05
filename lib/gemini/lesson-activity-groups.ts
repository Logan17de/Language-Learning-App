import "server-only";

import { shuffledChoices } from "@/lib/choice-order";
import { storyWordScript } from "@/lib/story-support";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import {
  filterStoryGrammarPatterns,
  grammarQuestionsPrompt,
  grammarQuestionsSchema,
  type RawGrammarQuestion,
  type RawGrammarQuestions,
} from "@/lib/gemini/grammar-question-contract";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";
import { generateReadingRegion } from "@/lib/gemini/reading-region-generation";
import type { RawReadingQuestion } from "@/lib/gemini/reading-comprehension-contract";
import { generateListeningRegion } from "@/lib/gemini/listening-region-generation";
import { generateSpeakingRegion } from "@/lib/gemini/speaking-region-generation";
import type { SpeakingActivityType } from "@/lib/gemini/speaking-question-contract";
import {
  vocabularyQuestionsPrompt,
  vocabularyQuestionsSchema,
  type RawVocabularyQuestion,
  type RawVocabularyQuestions,
} from "@/lib/gemini/vocabulary-question-contract";
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
  inspectableTerms?: InspectableTerm[];
}

export interface ListeningExercise {
  difficulty: Difficulty;
  conversationLines: string[];
  prompt: string;
  transcript: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
  inspectableTerms?: InspectableTerm[];
}

export interface SpeakingExercise {
  mode: "easy" | "medium" | "hard";
  questionType: SpeakingActivityType;
  prompt: string;
  easyPrompt: string;
  mediumPrompt: string;
  hardPrompt: string;
  expectedAnswer: string;
  modelAnswer: string;
  expectedConcepts: string[];
  semanticCriteria: string[];
  targetItemIds: string[];
  inspectableTerms?: InspectableTerm[];
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
  readingTitle: string;
  readingJapaneseTitle: string;
  readingConversation: ReadingLine[];
  readingQuestions: RawReadingQuestion[];
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

function duplicateChoices(choices: string[]): boolean {
  const values = choices.map(normalized);
  return new Set(values).size !== values.length;
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

const kanjiQuestionFormatIds = new Set([1, 3, 12, 16]);

function rawDifficulty(value: RawVocabularyQuestion["difficulty"]): Difficulty {
  if (value === "easy") return "Easy";
  if (value === "medium") return "Medium";
  return "Hard";
}

function vocabularyMode(formatId: number): PracticeQuestion["mode"] {
  if (formatId === 1 || formatId === 16) return "kanji-reading";
  if ([2, 3, 6, 7, 8].includes(formatId)) return "reading-meaning";
  if ([4, 12, 13].includes(formatId)) return "meaning-japanese";
  return "mixed";
}

function questionText(question: RawVocabularyQuestion): string {
  return [question.question, question.sentence ?? "", question.answer]
    .join("\n")
    .normalize("NFKC");
}

function targetIdForVocabularyQuestion(
  question: RawVocabularyQuestion,
  library: ResolvedLessonLibrary,
): string | null {
  const evidence = questionText(question);
  const normalizedAnswer = normalized(question.answer);

  if (kanjiQuestionFormatIds.has(question.format_id)) {
    const kanji = library.kanji.find((item) => evidence.includes(item.character));
    if (kanji) return kanji.libraryId;
  }

  const exactVocabulary = library.vocabulary.find((item) =>
    [item.term, item.reading, item.meaning]
      .map(normalized)
      .includes(normalizedAnswer),
  );
  if (exactVocabulary) return exactVocabulary.libraryId;

  const contextualVocabulary = library.vocabulary.find((item) =>
    [item.term, item.reading, item.meaning]
      .filter(Boolean)
      .some((value) => evidence.includes(value)),
  );
  if (contextualVocabulary) return contextualVocabulary.libraryId;

  return null;
}

function rawVocabularyQuestionIssues(
  value: unknown,
): string[] {
  return isRecord(value) &&
      Array.isArray(value.questions) &&
      value.questions.length > 0
    ? []
    : ["Vocabulary response must contain at least one question."];
}

function adaptVocabularyQuestions(
  questions: RawVocabularyQuestion[],
  library: ResolvedLessonLibrary,
): VocabularyKanjiGroup {
  return {
    vocabularyQuestions: questions.map((question) => {
      const targetId = targetIdForVocabularyQuestion(question, library);
      return {
        activityType: "multiple_choice",
        difficulty: rawDifficulty(question.difficulty),
        mode: vocabularyMode(question.format_id),
        skill: "understanding",
        prompt: question.question,
        cue: question.sentence ?? "",
        choices: question.choices,
        correctAnswer: question.answer,
        acceptedAnswers: [question.answer],
        explanation: `The correct answer is ${question.answer}.`,
        hintFront: "",
        hintBack: "",
        targetItemIds: targetId ? [targetId] : [],
      } satisfies PracticeQuestion;
    }),
  };
}

function grammarQuestionText(
  question: RawGrammarQuestion,
  includeDistractors: boolean,
): string {
  const filledSentence = (question.sentence ?? "").replace(
    /_{2,}|＿{2,}|<[^>]*BLANK[^>]*>/giu,
    question.answer,
  );
  return [
    question.question,
    question.sentence ?? "",
    filledSentence,
    question.answer,
    ...(includeDistractors ? question.choices : []),
  ]
    .join("\n")
    .normalize("NFKC")
    .replace(/\s+/gu, "");
}

function storyGrammarTargets(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
): ResolvedLessonLibrary["grammar"] {
  const story = draft.lines.map((line) => line.japanese).join("");
  const allowedPatterns = new Set(filterStoryGrammarPatterns({
    japaneseStory: story,
    targetGrammarPatterns: library.grammar.map((item) => item.pattern),
  }));
  return library.grammar.filter((item) =>
    allowedPatterns.has(item.pattern),
  );
}

function grammarTargetsForQuestion(
  question: RawGrammarQuestion,
  targets: ResolvedLessonLibrary["grammar"],
): ResolvedLessonLibrary["grammar"] {
  const primaryEvidence = grammarQuestionText(question, false);
  const primary = targets.filter((item) =>
    storyUsesGrammarPattern(primaryEvidence, item.pattern),
  );
  if (primary.length > 0) return primary;

  const fallbackEvidence = grammarQuestionText(question, true);
  return targets.filter((item) =>
    storyUsesGrammarPattern(fallbackEvidence, item.pattern),
  );
}

function rawGrammarQuestionIssues(
  value: unknown,
): string[] {
  return isRecord(value) &&
      Array.isArray(value.questions) &&
      value.questions.length > 0
    ? []
    : ["Grammar response must contain at least one question."];
}

function adaptGrammarQuestions(
  questions: RawGrammarQuestion[],
  targets: ResolvedLessonLibrary["grammar"],
): PracticeQuestion[] {
  return questions.map((question) => {
    const target = grammarTargetsForQuestion(question, targets)[0];
    return {
      activityType: "multiple_choice",
      difficulty: rawDifficulty(question.difficulty),
      mode: "grammar",
      skill: "understanding",
      prompt: question.question,
      cue: question.sentence ?? "",
      choices: question.choices,
      correctAnswer: question.answer,
      acceptedAnswers: [question.answer],
      explanation: `The correct answer is ${question.answer}.`,
      hintFront: "",
      hintBack: "",
      targetItemIds: target ? [target.libraryId] : [],
    } satisfies PracticeQuestion;
  });
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
  const generated = await generateStructured<RawVocabularyQuestions>({
    name: "vocab_questions",
    prompt: vocabularyQuestionsPrompt({
      japaneseStory: input.draft.lines.map((line) => line.japanese).join(""),
      knownKanji: input.library.kanji.map((item) => item.character),
    }),
    schema: vocabularyQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: rawVocabularyQuestionIssues,
  });
  return {
    value: adaptVocabularyQuestions(generated.value.questions, input.library),
    audit: {
      stage: "vocabulary_activities",
      model: generated.model,
      repaired: generated.repaired,
    },
  };
}

export async function generateGrammarAndReadingActivities(input: {
  requestId?: string;
  admin?: SupabaseClient;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<GrammarReadingGroup>> {
  const targets = storyGrammarTargets(input.draft, input.library);
  if (targets.length < 1) {
    throw new Error("No target grammar patterns appear in the generated story.");
  }

  const [grammar, reading] = await Promise.all([
    generateStructured<RawGrammarQuestions>({
      name: "grammar_questions",
      prompt: grammarQuestionsPrompt({
        japaneseStory: input.draft.lines.map((line) => line.japanese).join(""),
        targetGrammarPatterns: targets.map((item) => item.pattern),
      }),
      schema: grammarQuestionsSchema,
      strictSchema: true,
      exactSchemaName: true,
      validate: rawGrammarQuestionIssues,
    }),
    generateReadingRegion({
      requestId: input.requestId,
      admin: input.admin,
      topic: input.topic,
      level: input.level,
      draft: input.draft,
      library: input.library,
    }),
  ]);

  return {
    value: {
      grammarQuestions: adaptGrammarQuestions(grammar.value.questions, targets),
      readingTitle: reading.title,
      readingJapaneseTitle: reading.japaneseTitle,
      readingConversation: reading.lines,
      readingQuestions: reading.questions,
    },
    audit: {
      stage: "grammar_reading_activities",
      model: grammar.model === reading.audit.model
        ? grammar.model
        : `${grammar.model}, ${reading.audit.model}`,
      repaired: grammar.repaired || reading.audit.repaired,
    },
  };
}

export async function generateListeningAndSpeakingActivities(input: {
  requestId?: string;
  admin?: SupabaseClient;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<CommunicationGroup>> {
  const [listening, speaking] = await Promise.all([
    generateListeningRegion({
      requestId: input.requestId,
      admin: input.admin,
      level: input.level,
      library: input.library,
    }),
    generateSpeakingRegion({
      requestId: input.requestId,
      admin: input.admin,
      level: input.level,
      draft: input.draft,
      library: input.library,
    }),
  ]);
  return {
    value: {
      listeningExercises: listening.exercises,
      speakingExercises: speaking.exercises,
    },
    audit: {
      stage: "communication_activities",
      model: listening.audit.model === speaking.audit.model
        ? speaking.audit.model
        : `${listening.audit.model}, ${speaking.audit.model}`,
      repaired: listening.audit.repaired || speaking.audit.repaired,
    },
  };
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

function sentenceParts(value: string, japanese: boolean): string[] {
  const matcher = japanese
    ? /[^。！？!?]+[。！？!?]?/gu
    : /[^.!?]+[.!?]?/gu;
  return (value.match(matcher) ?? [value])
    .map((part) => part.trim())
    .filter(Boolean);
}

function playableStoryLines(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
): Array<{ japanese: string; english: string; words: InspectableTerm[] }> {
  return draft.lines.flatMap((line) => {
    const japanese = sentenceParts(line.japanese, true);
    const english = sentenceParts(line.english, false);
    const words = storyWords(line, library);
    return japanese.map((sentence, index) => ({
      japanese: sentence,
      english: english[index] ?? "",
      words: words.filter((word) => sentence.includes(word.surface)),
    }));
  });
}

export function assemblePlayableLesson(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  groups: ActivityGroups;
  audit: GenerationAuditEntry[];
}): PlayableLessonPackageV2 {
  const withTerms = (question: PracticeQuestion, section: string) => ({
    ...question,
    choices: shuffledChoices(
      question.choices,
      [section, question.prompt, question.cue, question.correctAnswer].join("\n"),
    ),
    inspectableTerms: inspectableTerms([question.prompt, question.cue], input.library),
  });
  const unique = <T,>(items: T[]): T[] => [...new Set(items)];
  const targetKanji = input.library.generationContext?.targetKanji ?? [];
  const packageKanji = targetKanji.length > 0
    ? targetKanji.flatMap((character) => {
        const item = input.library.kanji.find((candidate) => candidate.character === character);
        return item ? [item] : [];
      })
    : input.library.kanji.slice(0, 5);
  return {
    schemaVersion: 2,
    title: input.draft.title,
    japaneseTitle: input.draft.japaneseTitle,
    summary: input.draft.summary,
    storyPreview: input.draft.storyPreview,
    tags: unique([input.level, input.topic, ...input.draft.tags]).slice(0, 8),
    kanji: packageKanji.map((item) => ({
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
    story: playableStoryLines(input.draft, input.library),
    vocabularyQuestions: input.groups.vocabularyAndKanji.vocabularyQuestions.map(
      (question) => withTerms(question, "vocabulary"),
    ),
    grammarQuestions: input.groups.grammarAndReading.grammarQuestions.map(
      (question) => withTerms(question, "grammar"),
    ),
    readingTitle: input.groups.grammarAndReading.readingTitle,
    readingJapaneseTitle: input.groups.grammarAndReading.readingJapaneseTitle,
    readingConversation: input.groups.grammarAndReading.readingConversation.map((line) => ({
      ...line,
      inspectableTerms: line.inspectableTerms ??
        inspectableTerms([line.japanese, line.english], input.library),
    })),
    readingQuestions: input.groups.grammarAndReading.readingQuestions.map(
      (question, index) => ({
        id: `reading-question-${index + 1}`,
        ...question,
      }),
    ),
    listeningExercises: input.groups.communication.listeningExercises.map((exercise) => ({
      ...exercise,
      choices: shuffledChoices(
        exercise.choices,
        ["listening", exercise.prompt, exercise.correctAnswer].join("\n"),
      ),
      inspectableTerms: exercise.inspectableTerms ??
        inspectableTerms([exercise.prompt, exercise.transcript], input.library),
    })),
    speakingExercises: input.groups.communication.speakingExercises.map((exercise) => ({
      ...exercise,
      inspectableTerms: exercise.inspectableTerms ?? inspectableTerms([
          exercise.prompt,
          exercise.modelAnswer,
        ], input.library),
    })),
    reviewQuestions: input.groups.review.reviewQuestions.map((question) => ({
      ...question,
      choices: shuffledChoices(
        question.choices,
        ["review", question.category, question.prompt, question.correctAnswer].join("\n"),
      ),
    })),
    generationAudit: { calls: input.audit },
  };
}
