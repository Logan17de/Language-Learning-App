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
- Create exactly 5 listening questions.
- Each question must include a natural Japanese conversation of 5–10 lines.
- The conversation should be between 2 or more speakers.
- The learner should answer only after listening to the entire conversation.
- The question should test understanding of the conversation, not memorization.
- Include a mix of:
  - Direct information
  - Speaker intention
  - Sequence of events
  - Reason or purpose
  - Simple inference
- Provide four unique answer choices with exactly one correct answer.
- Keep everything appropriate for ${input.languageLevel}.
`;
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

export function listeningQuestionIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Listening response must be an object."];
  }
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    return ["Listening response needs exactly five questions."];
  }
  const issues: string[] = [];
  questions.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issues.push(`Listening question ${index + 1} must be an object.`);
      return;
    }
    const item = candidate as Record<string, unknown>;
    const conversation = Array.isArray(item.conversation)
      ? item.conversation.filter((line): line is string => typeof line === "string")
      : [];
    if (
      conversation.length < 5 ||
      conversation.length > 10 ||
      conversation.some((line) => !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(line))
    ) {
      issues.push(`Listening question ${index + 1} needs 5–10 Japanese conversation lines.`);
    }
    const choices = Array.isArray(item.choices)
      ? item.choices.filter((choice): choice is string => typeof choice === "string")
      : [];
    if (choices.length !== 4 || new Set(choices.map(normalized)).size !== 4) {
      issues.push(`Listening question ${index + 1} needs four unique choices.`);
    }
    if (
      typeof item.answer !== "string" ||
      choices.filter((choice) => normalized(choice) === normalized(item.answer as string)).length !== 1
    ) {
      issues.push(`Listening question ${index + 1} needs exactly one matching correct answer.`);
    }
  });
  return [...new Set(issues)];
}
