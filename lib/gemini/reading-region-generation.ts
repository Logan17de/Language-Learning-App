import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/gemini/structured-output";
import {
  readingPassagePrompt,
  readingPassageSchema,
  readingQuestionsPrompt,
  readingQuestionsSchema,
  type RawReadingPassage,
  type RawReadingQuestion,
  type RawReadingQuestions,
} from "@/lib/gemini/reading-comprehension-contract";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type { JLPTLevel } from "@/types/lesson";
import { partitionReadingPassage } from "@/lib/custom-lessons/reading-lines";

export interface GeneratedReadingLine {
  speaker: string;
  japanese: string;
  english: string;
  targetItemIds: string[];
  inspectableTerms: InspectableTerm[];
}

export interface GeneratedReadingRegion {
  title: string;
  japaneseTitle: string;
  lines: GeneratedReadingLine[];
  questions: RawReadingQuestion[];
  audit: GenerationAuditEntry;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function readingPassageOutputIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Reading passage response must be an object."];
  }
  const story = (value as Record<string, unknown>).japanese_story;
  return typeof story === "string" && story.trim().length > 0
    ? []
    : ["Reading passage response must not be empty."];
}

function readingQuestionIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Reading response must be an object."];
  }
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    return ["Reading response must contain exactly 5 questions."];
  }
  const issues: string[] = [];
  const difficulties = questions.map((question) =>
    question && typeof question === "object" && !Array.isArray(question)
      ? (question as Record<string, unknown>).difficulty
      : null,
  );
  const easy = difficulties.filter((item) => item === "easy").length;
  const medium = difficulties.filter((item) => item === "medium").length;
  const hard = difficulties.filter((item) => item === "hard").length;
  if (easy !== 2 || medium !== 2 || hard !== 1) {
    issues.push("Reading response must contain 2 easy, 2 medium, and 1 hard question.");
  }
  questions.forEach((question, index) => {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      issues.push(`Reading question ${index + 1} must be an object.`);
      return;
    }
    const item = question as Record<string, unknown>;
    const prompt = typeof item.question === "string" ? item.question.trim() : "";
    const answer = typeof item.answer === "string" ? item.answer.trim() : "";
    const choices = Array.isArray(item.choices)
      ? item.choices.filter((choice): choice is string => typeof choice === "string" && choice.trim().length > 0)
      : [];
    if (!prompt) issues.push(`Reading question ${index + 1} requires a question.`);
    if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
      issues.push(`Reading question ${index + 1} must contain four distinct choices.`);
    }
    if (!answer || !choices.map(normalized).includes(normalized(answer))) {
      issues.push(`Reading question ${index + 1} answer must occur in its choices.`);
    }
  });
  return issues;
}

function readingLines(passage: RawReadingPassage): GeneratedReadingLine[] {
  return partitionReadingPassage({
    japanese: passage.japanese_story,
    english: passage.english_translation,
    maximumLines: 6,
  }).map(({ japanese, english }) => ({
    speaker: "Reading",
    japanese,
    english,
    targetItemIds: [],
    inspectableTerms: [],
  }));
}

export async function generateReadingRegion(input: {
  requestId?: string;
  admin?: SupabaseClient;
  topic: string;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<GeneratedReadingRegion> {
  const context = input.library.generationContext;
  const passage = await generateStructured<RawReadingPassage>({
    name: "reading_lesson",
    prompt: readingPassagePrompt({
      languageLevel: `JLPT ${input.level}`,
      topic: input.topic,
      naturalInterests: context?.interests ?? input.draft.tags,
      targetGrammar: context?.targetGrammar ?? input.library.grammar.map((item) => item.pattern),
      targetKanji: context?.targetKanji ?? input.library.kanji.slice(0, 5).map((item) => item.character),
    }),
    schema: readingPassageSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: readingPassageOutputIssues,
    trace: { requestId: input.requestId, stage: "reading_passage" },
  });

  const questions = await generateStructured<RawReadingQuestions>({
    name: "reading_questions",
    prompt: readingQuestionsPrompt({
      languageLevel: `JLPT ${input.level}`,
      japaneseStory: passage.value.japanese_story,
    }),
    schema: readingQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: readingQuestionIssues,
    trace: { requestId: input.requestId, stage: "reading_questions" },
  });

  return {
    title: passage.value.english_title,
    japaneseTitle: passage.value.japanese_title,
    lines: readingLines(passage.value),
    questions: questions.value.questions,
    audit: {
      stage: "grammar_reading_activities",
      model: passage.model === questions.model
        ? passage.model
        : `${passage.model}, ${questions.model}`,
      repaired: passage.repaired || questions.repaired,
    },
  };
}
