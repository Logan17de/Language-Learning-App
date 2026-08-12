import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { storeGeneratedVocabularyTerms } from "@/lib/gemini/generated-vocabulary-storage";
import * as dictionaryVocabulary from "@/lib/gemini/simple-story-enrichment";
import type {
  GenerationAuditEntry,
  InspectableTerm,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import {
  speakingReadAloudIssues,
  speakingReadAloudPrompt,
  speakingReadAloudSchema,
  type RawSpeakingSentences,
  type SpeakingActivityType,
} from "@/lib/gemini/speaking-question-contract";
import { generateStructured } from "@/lib/gemini/structured-output";
import type { JLPTLevel } from "@/types/lesson";

export interface GeneratedSpeakingExercise {
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
  const speaking = await generateStructured<RawSpeakingSentences>({
    name: "speaking_read_aloud",
    prompt: speakingReadAloudPrompt({
      languageLevel: `JLPT ${input.level}`,
      japaneseStory: story,
      grammarPatterns:
        input.library.generationContext?.targetGrammar ??
        input.library.grammar.map((item) => item.pattern),
    }),
    schema: speakingReadAloudSchema,
    strictSchema: true,
    exactSchemaName: true,
    validate: speakingReadAloudIssues,
    trace: { requestId: input.requestId, stage: "speaking_read_aloud" },
  });

  const speakingText = speaking.value.sentences
    .map((item) => item.sentence)
    .join("\n");
  const vocabulary = await dictionaryVocabulary.lookupJapaneseDictionaryVocabulary({
    japanese: speakingText,
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
    exercises: speaking.value.sentences.map((item, index) => {
      const inspectableTerms = uniqueTerms(
        terms.filter((term) => item.sentence.includes(term.surface)),
      );
      const termIds = [...new Set(
        inspectableTerms.map((term) => term.libraryId),
      )].slice(0, 5);
      const fallbackId = fallbackIds.length > 0
        ? fallbackIds[index % fallbackIds.length]
        : undefined;
      return {
        mode: item.difficulty,
        questionType: "read_aloud",
        prompt: item.sentence,
        easyPrompt: item.difficulty === "easy" ? item.sentence : "",
        mediumPrompt: item.difficulty === "medium" ? item.sentence : "",
        hardPrompt: item.difficulty === "hard" ? item.sentence : "",
        expectedAnswer: item.sentence,
        modelAnswer: item.sentence,
        expectedConcepts: [item.sentence],
        semanticCriteria: ["The transcript should closely match the displayed sentence."],
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
      model: `${speaking.model}, ${dictionaryVocabulary.DICTIONARY_SOURCE_MODEL}`,
      repaired: speaking.repaired,
    },
  };
}
