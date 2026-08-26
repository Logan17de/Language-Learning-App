import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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

export async function generateListeningRegion(input: {
  requestId?: string;
  admin?: SupabaseClient;
  topic: string;
  japaneseStory: string;
  level: JLPTLevel;
  library: ResolvedLessonLibrary;
}): Promise<GeneratedListeningRegion> {
  const listening = await generateStructured<RawListeningQuestions>({
    name: "listening_questions",
    prompt: listeningQuestionsPrompt({
      languageLevel: `JLPT ${input.level}`,
      topic: input.topic,
      japaneseStory: input.japaneseStory,
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

  return {
    exercises: listening.value.questions.map((question) => ({
      difficulty: difficulty(question.difficulty),
      conversationLines: question.conversation,
      prompt: question.question,
      transcript: question.conversation.join("\n"),
      choices: question.choices,
      correctAnswer: question.answer,
      explanation: `The correct answer is ${question.answer}.`,
      targetItemIds: [],
      inspectableTerms: [],
    })),
    audit: {
      stage: "communication_activities",
      model: listening.model,
      repaired: listening.repaired,
    },
  };
}
