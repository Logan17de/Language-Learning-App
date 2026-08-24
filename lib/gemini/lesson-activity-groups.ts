import "server-only";

import { shuffledChoices } from "@/lib/choice-order";
import { storyWordScript } from "@/lib/story-support";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/gemini/structured-output";
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
  type RawGrammarTeaching,
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
  type RawKanjiTeaching,
  type RawVocabularyQuestion,
  type RawVocabularyQuestions,
} from "@/lib/gemini/vocabulary-question-contract";
import type { JLPTLevel } from "@/types/lesson";
import { curatedGrammarPattern } from "@/lib/curated-grammar-catalog";

export type ActivityGroupName =
  | "vocabulary_and_kanji"
  | "grammar_and_reading"
  | "listening_and_speaking";

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

export interface KanjiTeachingItem {
  libraryId: string;
  character: string;
  reading: string;
  meaning: string;
}

export interface GrammarTeachingItem {
  libraryId: string;
  pattern: string;
  meaning: string;
  formation: string;
  usage: string;
  example: string;
  translation: string;
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

export interface VocabularyKanjiGroup {
  kanjiTeaching: KanjiTeachingItem[];
  vocabularyQuestions: PracticeQuestion[];
}

export interface GrammarReadingGroup {
  grammarTeaching: GrammarTeachingItem[];
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

export interface ActivityGroups {
  vocabularyAndKanji: VocabularyKanjiGroup;
  grammarAndReading: GrammarReadingGroup;
  communication: CommunicationGroup;
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

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function difficultySplitIssues(
  questions: unknown[],
  expected: { easy: number; medium: number; hard: number },
  label: string,
): string[] {
  const values = questions.map((question) =>
    isRecord(question) ? question.difficulty : null,
  );
  const easy = values.filter((value) => value === "easy").length;
  const medium = values.filter((value) => value === "medium").length;
  const hard = values.filter((value) => value === "hard").length;
  return easy === expected.easy && medium === expected.medium && hard === expected.hard
    ? []
    : [`${label} response must contain ${expected.easy} easy, ${expected.medium} medium, and ${expected.hard} hard questions.`];
}

function indexedTeachingIssues(
  value: unknown,
  expectedLength: number,
  label: string,
  fields: string[],
): string[] {
  if (!Array.isArray(value)) return [`${label} must be an array.`];
  const issues: string[] = [];
  if (value.length !== expectedLength) {
    issues.push(`${label} must contain exactly ${expectedLength} entries.`);
  }
  const indexes: number[] = [];
  value.forEach((raw, position) => {
    if (!isRecord(raw)) {
      issues.push(`${label} ${position + 1} must be an object.`);
      return;
    }
    if (!Number.isInteger(raw.requestIndex)) {
      issues.push(`${label} ${position + 1} requires an integer requestIndex.`);
    } else {
      indexes.push(Number(raw.requestIndex));
    }
    for (const field of fields) {
      if (!hasText(raw[field])) issues.push(`${label} ${position + 1} requires non-empty ${field}.`);
    }
  });
  const expected = Array.from({ length: expectedLength }, (_, index) => index);
  if (
    indexes.length !== expectedLength ||
    new Set(indexes).size !== expectedLength ||
    expected.some((index) => !indexes.includes(index))
  ) {
    issues.push(`${label} requestIndex values must cover 0 through ${expectedLength - 1} exactly once.`);
  }
  return issues;
}

function multipleChoiceContentIssues(raw: unknown, label: string): string[] {
  if (!isRecord(raw)) return [`${label} must be an object.`];
  const issues: string[] = [];
  if (!hasText(raw.question) && !hasText(raw.prompt)) {
    issues.push(`${label} requires a question or prompt.`);
  }
  const answer = hasText(raw.answer)
    ? raw.answer
    : hasText(raw.correctAnswer)
      ? raw.correctAnswer
      : "";
  const choices = Array.isArray(raw.choices)
    ? raw.choices.filter((choice): choice is string => hasText(choice))
    : [];
  const normalizedChoices = choices.map(normalized);
  if (choices.length !== 4 || new Set(normalizedChoices).size !== 4) {
    issues.push(`${label} needs four distinct choices.`);
  }
  if (!answer || !normalizedChoices.includes(normalized(answer))) {
    issues.push(`${label} answer must occur in its choices.`);
  }
  return issues;
}

function targetKanjiCharacters(library: ResolvedLessonLibrary): string[] {
  return library.generationContext?.targetKanji?.length
    ? library.generationContext.targetKanji
    : library.kanji.slice(0, 5).map((item) => item.character);
}

function targetKanjiRecords(library: ResolvedLessonLibrary) {
  return targetKanjiCharacters(library).flatMap((character) => {
    const item = library.kanji.find((candidate) => candidate.character === character);
    return item ? [item] : [];
  });
}

function targetGrammarRecords(library: ResolvedLessonLibrary) {
  const patterns = library.generationContext?.targetGrammar?.length
    ? library.generationContext.targetGrammar
    : library.grammar.map((item) => item.pattern);
  return patterns.flatMap((pattern) => {
    const item = library.grammar.find((candidate) => candidate.pattern === pattern);
    return item ? [item] : [];
  });
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
  return [
    question.question,
    question.sentence ?? "",
    question.answer,
    ...question.choices,
  ].join("\n").normalize("NFKC");
}

function rawVocabularyQuestionIssues(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    return ["Vocabulary response must contain exactly 7 questions."];
  }
  const issues = indexedTeachingIssues(
    value.kanjiTeaching,
    5,
    "Kanji teaching",
    ["reading", "meaning"],
  );
  if (value.questions.length !== 7) {
    issues.push("Vocabulary response must contain exactly 7 questions.");
  }
  issues.push(
    ...difficultySplitIssues(
      value.questions,
      { easy: 3, medium: 2, hard: 2 },
      "Vocabulary",
    ),
  );
  value.questions.forEach((raw, index) => {
    issues.push(...multipleChoiceContentIssues(raw, `Vocabulary question ${index + 1}`));
  });
  return issues;
}

function adaptKanjiTeaching(
  items: RawKanjiTeaching[],
  library: ResolvedLessonLibrary,
): KanjiTeachingItem[] {
  const byIndex = new Map(items.map((item) => [item.requestIndex, item]));
  const records = targetKanjiRecords(library);
  if (records.length !== 5) {
    throw new Error("Five target kanji identities are required before activity generation.");
  }
  return records.map((record, index) => {
    const item = byIndex.get(index);
    if (!item) throw new Error(`Kanji teaching entry ${index} is missing.`);
    return {
      libraryId: record.libraryId,
      character: record.character,
      reading: item.reading,
      meaning: item.meaning,
    };
  });
}

function targetIdsForVocabularyQuestion(
  question: RawVocabularyQuestion,
  library: ResolvedLessonLibrary,
): string[] {
  if (!kanjiQuestionFormatIds.has(question.format_id)) return [];
  const evidence = questionText(question);
  const target = targetKanjiRecords(library).find((item) =>
    evidence.includes(item.character),
  );
  return target ? [target.libraryId] : [];
}

function adaptVocabularyQuestions(
  questions: RawVocabularyQuestion[],
  library: ResolvedLessonLibrary,
): PracticeQuestion[] {
  return questions.map((question) => ({
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
    targetItemIds: targetIdsForVocabularyQuestion(question, library),
  }));
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
  const targets = targetGrammarRecords(library);
  const allowedPatterns = new Set(
    filterStoryGrammarPatterns({
      japaneseStory: story,
      targetGrammarPatterns: targets.map((item) => item.pattern),
    }),
  );
  return targets.filter((item) => allowedPatterns.has(item.pattern));
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

function rawGrammarQuestionIssues(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    return ["Grammar response must contain exactly 7 questions."];
  }
  const issues = indexedTeachingIssues(
    value.grammarTeaching,
    3,
    "Grammar teaching",
    ["meaning", "formation", "usage", "example", "translation"],
  );
  if (value.questions.length !== 7) {
    issues.push("Grammar response must contain exactly 7 questions.");
  }
  issues.push(
    ...difficultySplitIssues(
      value.questions,
      { easy: 3, medium: 2, hard: 2 },
      "Grammar",
    ),
  );
  value.questions.forEach((raw, index) => {
    issues.push(...multipleChoiceContentIssues(raw, `Grammar question ${index + 1}`));
  });
  return issues;
}

/**
 * How a pattern is built, when to reach for it, and one example come from the
 * curated bank rather than from this lesson's generation. The same pattern was
 * otherwise explained differently every time it appeared, and each explanation
 * was only as good as that one call.
 *
 * The model still supplies the short meaning gloss, which the bank does not
 * carry, and still supplies everything for a pattern the bank has never heard
 * of — a lesson is never blocked on the catalog being complete.
 */
function adaptGrammarTeaching(
  items: RawGrammarTeaching[],
  targets: ResolvedLessonLibrary["grammar"],
): GrammarTeachingItem[] {
  const byIndex = new Map(items.map((item) => [item.requestIndex, item]));
  if (targets.length !== 3) {
    throw new Error("Three target grammar identities are required before activity generation.");
  }
  return targets.map((target, index) => {
    const item = byIndex.get(index);
    if (!item) throw new Error(`Grammar teaching entry ${index} is missing.`);
    const curated = curatedGrammarPattern(target.pattern);
    return {
      libraryId: target.libraryId,
      pattern: target.pattern,
      meaning: item.meaning,
      formation: curated?.structure || item.formation,
      usage: curated?.usage || item.usage,
      example: curated?.exampleJapanese || item.example,
      translation: curated?.exampleEnglish || item.translation,
    };
  });
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
    };
  });
}

export async function generateVocabularyAndKanjiActivities(input: {
  requestId?: string;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<ActivityGroupResult<VocabularyKanjiGroup>> {
  const targetKanji = targetKanjiCharacters(input.library);
  if (targetKanji.length !== 5) {
    throw new Error("Vocabulary and kanji generation requires exactly five target kanji.");
  }
  const generated = await generateStructured<RawVocabularyQuestions>({
    name: "vocab_questions",
    prompt: vocabularyQuestionsPrompt({
      japaneseStory: input.draft.lines.map((line) => line.japanese).join(""),
      targetKanji,
    }),
    schema: vocabularyQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: rawVocabularyQuestionIssues,
    trace: { requestId: input.requestId, stage: "vocabulary_questions" },
  });
  return {
    value: {
      kanjiTeaching: adaptKanjiTeaching(
        generated.value.kanjiTeaching,
        input.library,
      ),
      vocabularyQuestions: adaptVocabularyQuestions(
        generated.value.questions,
        input.library,
      ),
    },
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
  const storyTargets = storyGrammarTargets(input.draft, input.library);
  const targets =
    storyTargets.length === 3 ? storyTargets : targetGrammarRecords(input.library);
  if (targets.length !== 3) {
    throw new Error("Grammar generation requires exactly three target grammar identities.");
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
      trace: { requestId: input.requestId, stage: "grammar_questions" },
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
      grammarTeaching: adaptGrammarTeaching(
        grammar.value.grammarTeaching,
        targets,
      ),
      grammarQuestions: adaptGrammarQuestions(grammar.value.questions, targets),
      readingTitle: reading.title,
      readingJapaneseTitle: reading.japaneseTitle,
      readingConversation: reading.lines,
      readingQuestions: reading.questions,
    },
    audit: {
      stage: "grammar_reading_activities",
      model:
        grammar.model === reading.audit.model
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
  const japaneseStory = input.draft.lines.map((line) => line.japanese).join("");
  const [listening, speaking] = await Promise.all([
    generateListeningRegion({
      requestId: input.requestId,
      admin: input.admin,
      topic: input.topic,
      japaneseStory,
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
      model:
        listening.audit.model === speaking.audit.model
          ? speaking.audit.model
          : `${listening.audit.model}, ${speaking.audit.model}`,
      repaired: listening.audit.repaired || speaking.audit.repaired,
    },
  };
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

function playableStoryLines(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
): Array<{ japanese: string; english: string; words: InspectableTerm[] }> {
  return draft.lines.map((line) => ({
    japanese: line.japanese.trim(),
    english: line.english.trim(),
    words: storyWords(line, library),
  }));
}

export function assemblePlayableLesson(input: {
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  groups: ActivityGroups;
  audit: GenerationAuditEntry[];
}): PlayableLessonPackageV2 {
  const withNoTappableTerms = (question: PracticeQuestion, section: string) => ({
    ...question,
    choices: shuffledChoices(
      question.choices,
      [section, question.prompt, question.cue, question.correctAnswer].join("\n"),
    ),
    inspectableTerms: [] as InspectableTerm[],
  });
  const unique = <T,>(items: T[]): T[] => [...new Set(items)];

  return {
    schemaVersion: 2,
    title: input.draft.title,
    japaneseTitle: input.draft.japaneseTitle,
    summary: input.draft.summary,
    storyPreview: input.draft.storyPreview,
    tags: unique([input.level, input.topic, ...input.draft.tags]).slice(0, 8),
    kanji: input.groups.vocabularyAndKanji.kanjiTeaching.map((item) => ({
      libraryId: item.libraryId,
      character: item.character,
      reading: item.reading,
      meaning: item.meaning,
    })),
    vocabulary: input.library.vocabulary,
    grammar: input.groups.grammarAndReading.grammarTeaching.map((item) => ({
      libraryId: item.libraryId,
      pattern: item.pattern,
      meaning: item.meaning,
      structure: item.formation,
      usage: item.usage,
      example: item.example,
      translation: item.translation,
      commonMistake: "",
    })),
    story: playableStoryLines(input.draft, input.library),
    vocabularyQuestions: input.groups.vocabularyAndKanji.vocabularyQuestions.map(
      (question) => withNoTappableTerms(question, "vocabulary"),
    ),
    grammarQuestions: input.groups.grammarAndReading.grammarQuestions.map(
      (question) => withNoTappableTerms(question, "grammar"),
    ),
    readingTitle: input.groups.grammarAndReading.readingTitle,
    readingJapaneseTitle: input.groups.grammarAndReading.readingJapaneseTitle,
    readingConversation: input.groups.grammarAndReading.readingConversation.map(
      (line) => ({
        ...line,
        targetItemIds: line.targetItemIds ?? [],
        inspectableTerms: [],
      }),
    ),
    readingQuestions: input.groups.grammarAndReading.readingQuestions.map(
      (question, index) => ({
        id: `reading-question-${index + 1}`,
        ...question,
      }),
    ),
    listeningExercises: input.groups.communication.listeningExercises.map(
      (exercise) => ({
        ...exercise,
        choices: shuffledChoices(
          exercise.choices,
          ["listening", exercise.prompt, exercise.correctAnswer].join("\n"),
        ),
        inspectableTerms: [],
      }),
    ),
    speakingExercises: input.groups.communication.speakingExercises.map(
      (exercise) => ({
        ...exercise,
        inspectableTerms: [],
      }),
    ),
    generationAudit: { calls: input.audit },
  };
}
