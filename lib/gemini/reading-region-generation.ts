import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { generateStructured } from "@/lib/gemini/structured-output";
import { storeGeneratedVocabularyTerms } from "@/lib/gemini/generated-vocabulary-storage";
import {
  readingPassagePrompt,
  readingPassageSchema,
  readingQuestionsPrompt,
  readingQuestionsSchema,
  type RawReadingPassage,
  type RawReadingQuestion,
  type RawReadingQuestions,
} from "@/lib/gemini/reading-comprehension-contract";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentOutputIssues,
  storyEnrichmentPrompt,
  type SimpleStoryEnrichment,
} from "@/lib/gemini/simple-story-enrichment-contract";
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
  return Array.isArray(questions) && questions.length > 0
    ? []
    : ["Reading response must contain at least one question."];
}

function readingLines(
  passage: RawReadingPassage,
  terms: InspectableTerm[],
): GeneratedReadingLine[] {
  return partitionReadingPassage({
    japanese: passage.japanese_story,
    english: passage.english_translation,
    maximumLines: 6,
  }).map(({ japanese, english }) => {
    const lineTerms = terms.filter((term) => japanese.includes(term.surface));
    return {
      speaker: "Reading",
      japanese,
      english,
      targetItemIds: [...new Set(lineTerms.map((term) => term.libraryId))].slice(0, 5),
      inspectableTerms: lineTerms,
    };
  });
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

  const enrichment = await generateStructured<SimpleStoryEnrichment>({
    name: "reading_vocabulary",
    prompt: storyEnrichmentPrompt(passage.value.japanese_story),
    schema: simpleStoryEnrichmentSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: storyEnrichmentOutputIssues,
    trace: { requestId: input.requestId, stage: "reading_enrichment" },
  });
  const terms = await storeGeneratedVocabularyTerms({
    admin: input.admin,
    requestId: input.requestId,
    level: input.level,
    vocabulary: enrichment.value.vocabulary,
    model: enrichment.model,
    library: input.library,
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
    lines: readingLines(passage.value, terms),
    questions: questions.value.questions,
    audit: {
      stage: "grammar_reading_activities",
      model: [...new Set([passage.model, enrichment.model, questions.model])].join(", "),
      repaired: passage.repaired || enrichment.repaired || questions.repaired,
    },
  };
}
