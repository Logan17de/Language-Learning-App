import type { JsonSchema } from "@/lib/openai/structured-output";
import { hasNamedSpeaker, parseDialogueLine } from "@/lib/audio/dialogue-speech";

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
  topic: string;
  japaneseStory: string;
}): string {
  return `
Create exactly 5 listening-comprehension questions for ${input.languageLevel} learners.

Lesson topic:
${input.topic}

Lesson story context:
${input.japaneseStory}

grammar patterns:
${pythonStringList(input.knownPatterns)}

Requirements:
- Create exactly 5 listening questions: 2 easy, 2 medium, and 1 hard.
- Each question must include a natural Japanese conversation of 5–10 lines.
- The conversation must be between 2 or more named speakers.
- Begin every line with a natural character name and a full-width colon, for example: 田中：おはようございます。
- Never use generic labels such as 男, 女, 男性, 女性, おとこ, おんな, otoko, onna, A, B, Speaker 1, or Speaker 2.
- Keep every conversation recognizably connected to the lesson topic or story context. You may extend naturally with related people, places, situations, or new details, but do not jump to unrelated practice.
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
    issues.push("Listening response must contain 2 easy, 2 medium, and 1 hard question.");
  }
  questions.forEach((question, questionIndex) => {
    const conversation =
      question && typeof question === "object" && !Array.isArray(question)
        ? (question as Record<string, unknown>).conversation
        : null;
    if (!Array.isArray(conversation)) return;
    if (!conversation.every((line) => typeof line === "string" && hasNamedSpeaker(line))) {
      issues.push(`Listening question ${questionIndex + 1} must name the speaker on every line.`);
      return;
    }
    const names = new Set(
      conversation
        .map((line) => parseDialogueLine(String(line))?.speaker)
        .filter(Boolean),
    );
    if (names.size < 2) {
      issues.push(`Listening question ${questionIndex + 1} must use at least 2 named speakers.`);
    }
  });
  return issues;
}
