import type { JsonSchema } from "@/lib/openai/structured-output";
import {
  storyGenerationSchema,
  storyGenerationPrompt,
} from "@/lib/gemini/story-generation-contract";

export interface RawReadingPassage {
  selected_interest: string;
  japanese_title: string;
  english_title: string;
  japanese_story: string;
  english_translation: string;
}

export interface RawReadingQuestion {
  q_no: number;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  choices: string[];
  answer: string;
}

export interface RawReadingQuestions {
  questions: RawReadingQuestion[];
}

export const readingPassageSchema = storyGenerationSchema;

export const readingQuestionsSchema: JsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q_no", "difficulty", "question", "choices", "answer"],
        properties: {
          q_no: { type: "integer", minimum: 1, maximum: 5 },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          question: { type: "string" },
          choices: {
            type: "array",
            minItems: 4,
            maxItems: 4,
            items: { type: "string" },
          },
          answer: { type: "string" },
        },
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

export function readingPassagePrompt(input: {
  languageLevel: string;
  topic: string;
  naturalInterests: string[];
  targetGrammar: string[];
  targetKanji: string[];
}): string {
  return storyGenerationPrompt({
    languageLevel: input.languageLevel,
    topic: input.topic,
    naturalInterests: input.naturalInterests,
    targetGrammar: input.targetGrammar,
    targetKanji: input.targetKanji,
  });
}

export function readingQuestionsPrompt(input: {
  languageLevel: string;
  japaneseStory: string;
}): string {
  return `
Create reading-comprehension multiple-choice questions for this fixed Japanese passage.

Language level: ${input.languageLevel}

Passage:
${input.japaneseStory}

Requirements:
- Do not rewrite the passage.
- Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.
- Base every question only on the passage.
- Every question must be multiple choice with exactly four distinct choices.
- Exactly one choice must be correct, and answer must exactly match that choice.
- Easy questions should test direct information.
- Medium questions may test sequence, reason, or speaker/character intention.
- Hard questions may test inference or combine details from multiple parts of the passage.
- Keep the Japanese appropriate for ${input.languageLevel}.
- Return only the required JSON.
`;
}
