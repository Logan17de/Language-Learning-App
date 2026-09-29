import type { JsonSchema } from "@/lib/openai/structured-output";

export type RawListeningDifficulty = "easy" | "medium" | "hard";

export interface RawListeningQuestion {
  difficulty: RawListeningDifficulty;
  conversation: string[];
  question: string;
  choices: string[];
  answer: string;
}

export interface RawListeningQuestions {
  questions: RawListeningQuestion[];
}

export const listeningQuestionsSchema: JsonSchema = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          conversation: {
            type: "array",
            minItems: 5,
            maxItems: 10,
            items: { type: "string" },
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
        required: [
          "difficulty",
          "conversation",
          "question",
          "choices",
          "answer",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

function pythonStringList(values: string[]): string {
  return `[${values.map((value) => `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`).join(", ")}]`;
}

export function listeningQuestionsPrompt(input: {
  languageLevel: string;
  knownPatterns: string[];
}): string {
  return `
Create exactly 5 listening-comprehension questions for ${input.languageLevel} learners.

grammar patterns:
${pythonStringList(input.knownPatterns)}

Requirements:
- Create exactly 5 listening questions: 2 easy, 2 medium, and 1 hard.
- Each question must include a natural Japanese conversation of 5–10 lines.
- The conversation should be between 2 or more speakers.
- The learner should answer only after listening to the entire conversation.
- The question should test understanding of the conversation, not memorization.
- Include a mix of direct information, speaker intention, sequence of events, reason or purpose, and simple inference.
- The supplied grammar patterns are useful context, not a whitelist.
- Provide four unique answer choices with exactly one correct answer.
- Keep everything appropriate for ${input.languageLevel}.
`;
}

export function listeningQuestionIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Listening response must be an object."];
  }
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    return ["Listening response must contain exactly 5 questions."];
  }
  const difficulties = questions.map((question) =>
    question && typeof question === "object" && !Array.isArray(question)
      ? (question as Record<string, unknown>).difficulty
      : null,
  );
  const easy = difficulties.filter((item) => item === "easy").length;
  const medium = difficulties.filter((item) => item === "medium").length;
  const hard = difficulties.filter((item) => item === "hard").length;
  return easy === 2 && medium === 2 && hard === 1
    ? []
    : ["Listening response must contain 2 easy, 2 medium, and 1 hard question."];
}
