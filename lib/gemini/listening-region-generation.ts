import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { storeGeneratedVocabularyTerms } from "@/lib/gemini/generated-vocabulary-storage";
import * as dictionaryVocabulary from "@/lib/gemini/simple-story-enrichment";
import {
  listeningQuestionIssues,
  listeningQuestionsPrompt,
  listeningQuestionsSchema,
  type RawListeningDifficulty,
  type RawListeningQuestions,
} from "@/lib/gemini/listening-question-contract";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  ResolvedLessonLibrary,
} from "@/lib/gemini/lesson-engine-v2";
import { generateStructured } from "@/lib/gemini/structured-output";
import type { JLPTLevel } from "@/types/lesson";

export interface GeneratedListeningExercise {
  difficulty: "Easy" | "Medium" | "Hard";
  conversationLines: string[];
  prompt: string;
  transcript: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
  inspectableTerms: InspectableTerm[];
}

export interface GeneratedListeningRegion {
  exercises: GeneratedListeningExercise[];
  audit: GenerationAuditEntry;
}

function difficulty(value: RawListeningDifficulty): GeneratedListeningExercise["difficulty"] {
  if (value === "easy") return "Easy";
  if (value === "hard") return "Hard";
  return "Medium";
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

function generatedText(value: RawListeningQuestions): string {
  return value.questions
    .flatMap((question) => [
      ...question.conversation,
      question.question,
      ...question.choices,
    ])
    .join("\n");
}

export async function generateListeningRegion(input: {
  requestId?: string;
  admin?: SupabaseClient;
  level: JLPTLevel;
  library: ResolvedLessonLibrary;
}): Promise<GeneratedListeningRegion> {
  const listening = await generateStructured<RawListeningQuestions>({
    name: "listening_questions",
    prompt: listeningQuestionsPrompt({
      languageLevel: `JLPT ${input.level}`,
      knownPatterns:
        input.library.generationContext?.targetGrammar ??
        input.library.grammar.map((item) => item.pattern),
    }),
    schema: listeningQuestionsSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: listeningQuestionIssues,
    trace: { requestId: input.requestId, stage: "listening_questions" },
  });

  const listeningText = generatedText(listening.value);
  const vocabulary = await dictionaryVocabulary.lookupJapaneseDictionaryVocabulary({
    japanese: listeningText,
  });
  const terms = await storeGeneratedVocabularyTerms({
    admin: input.admin,
    requestId: input.requestId,
    level: input.level,
    vocabulary,
    model: dictionaryVocabulary.DICTIONARY_SOURCE_MODEL,
    library: input.library,
  });

  const fallbackIds = [
    ...input.library.grammar.map((item) => item.libraryId),
    ...input.library.vocabulary.map((item) => item.libraryId),
    ...input.library.kanji.map((item) => item.libraryId),
  ];
  return {
    exercises: listening.value.questions.map((question, index) => {
      const text = [
        ...question.conversation,
        question.question,
        ...question.choices,
      ].join("\n");
      const inspectableTerms = uniqueTerms(
        terms.filter((term) => text.includes(term.surface)),
      );
      const termIds = [...new Set(
        inspectableTerms.map((term) => term.libraryId),
      )].slice(0, 5);
      const fallbackId = fallbackIds.length > 0
        ? fallbackIds[index % fallbackIds.length]
        : undefined;
      return {
        difficulty: difficulty(question.difficulty),
        conversationLines: question.conversation,
        prompt: question.question,
        transcript: question.conversation.join("\n"),
        choices: question.choices,
        correctAnswer: question.answer,
        explanation: `The correct answer is ${question.answer}.`,
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
      model: `${listening.model}, ${dictionaryVocabulary.DICTIONARY_SOURCE_MODEL}`,
      repaired: listening.repaired,
    },
  };
}
