import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { storeGeneratedVocabularyTerms } from "@/lib/gemini/generated-vocabulary-storage";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentPrompt,
  type SimpleStoryEnrichment,
} from "@/lib/gemini/simple-story-enrichment-contract";
import {
  speakingQuestionIssues,
  speakingQuestionsPrompt,
  speakingQuestionsSchema,
  type RawSpeakingQuestions,
  type SpeakingQuestionType,
} from "@/lib/gemini/speaking-question-contract";
import { generateStructured } from "@/lib/gemini/structured-output";
import type { JLPTLevel } from "@/types/lesson";

export interface GeneratedSpeakingExercise {
  mode: "easy" | "medium" | "hard";
  questionType: SpeakingQuestionType;
  prompt: string;
  easyPrompt: string;
  mediumPrompt: string;
  hardPrompt: string;
  expectedAnswer: string;
  modelAnswer: string;
  expectedConcepts: string[];
  semanticCriteria: string[];
  targetItemIds: string[];
  inspectableTerms: InspectableTerm[];
}

export interface GeneratedSpeakingRegion {
  exercises: GeneratedSpeakingExercise[];
  audit: GenerationAuditEntry;
}

function uniqueTerms(terms: InspectableTerm[]): InspectableTerm[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = `${term.libraryId}:${term.surface}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function generateSpeakingRegion(input: {
  requestId?: string;
  admin?: SupabaseClient;
  level: JLPTLevel;
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
}): Promise<GeneratedSpeakingRegion> {
  const story = input.draft.lines.map((line) => line.japanese).join("");
  const speaking = await generateStructured<RawSpeakingQuestions>({
    name: "speaking_questions",
    prompt: speakingQuestionsPrompt({
      languageLevel: `JLPT ${input.level}`,
      japaneseStory: story,
      grammarPatterns:
        input.library.generationContext?.targetGrammar ??
        input.library.grammar.map((item) => item.pattern),
    }),
    schema: speakingQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: speakingQuestionIssues,
    trace: { requestId: input.requestId, stage: "speaking_questions" },
  });

  const speakingText = speaking.value.questions
    .flatMap((question) => [question.question, question.model_answer])
    .join("\n");
  const enrichment = await generateStructured<SimpleStoryEnrichment>({
    name: "speaking_vocabulary",
    prompt: storyEnrichmentPrompt(speakingText),
    schema: simpleStoryEnrichmentSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: () => [],
    trace: { requestId: input.requestId, stage: "speaking_enrichment" },
  });
  const terms = await storeGeneratedVocabularyTerms({
    admin: input.admin,
    requestId: input.requestId,
    level: input.level,
    vocabulary: enrichment.value.vocabulary,
    model: enrichment.model,
    library: input.library,
  });

  const fallbackIds = [
    ...input.library.grammar.map((item) => item.libraryId),
    ...input.library.vocabulary.map((item) => item.libraryId),
    ...input.library.kanji.map((item) => item.libraryId),
  ];
  return {
    exercises: speaking.value.questions.map((question, index) => {
      const inspectableTerms = uniqueTerms(
        terms.filter((term) =>
          question.question.includes(term.surface) ||
          question.model_answer.includes(term.surface),
        ),
      );
      const termIds = [...new Set(
        inspectableTerms.map((term) => term.libraryId),
      )].slice(0, 5);
      const fallbackId = fallbackIds.length > 0
        ? fallbackIds[index % fallbackIds.length]
        : undefined;
      return {
        mode: question.difficulty,
        questionType: question.question_type,
        prompt: question.question,
        easyPrompt: question.difficulty === "easy" ? question.question : "",
        mediumPrompt: question.difficulty === "medium" ? question.question : "",
        hardPrompt: question.difficulty === "hard" ? question.question : "",
        expectedAnswer: question.model_answer,
        modelAnswer: question.model_answer,
        expectedConcepts: question.expected_concepts,
        semanticCriteria: question.semantic_criteria,
        targetItemIds: termIds.length > 0
          ? termIds
          : fallbackId
            ? [fallbackId]
            : [],
        inspectableTerms,
      };
    }),
    audit: {
      stage: "communication_activities",
      model: speaking.model === enrichment.model
        ? speaking.model
        : `${speaking.model}, ${enrichment.model}`,
      repaired: speaking.repaired || enrichment.repaired,
    },
  };
}
