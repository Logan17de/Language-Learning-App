import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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

  return {
    exercises: speaking.value.sentences.map((item) => ({
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
      targetItemIds: [],
      inspectableTerms: [],
    })),
    audit: {
      stage: "communication_activities",
      model: speaking.model,
      repaired: speaking.repaired,
    },
  };
}
