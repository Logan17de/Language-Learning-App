import type { JsonSchema } from "@/lib/openai/structured-output";

export type RawSpeakingDifficulty = "easy" | "medium" | "hard";
export type SpeakingQuestionType =
  | "direct_information"
  | "sequence_of_events"
  | "speaker_intention"
  | "reason_or_purpose"
  | "simple_inference";

export interface RawSpeakingQuestion {
  difficulty: RawSpeakingDifficulty;
  question_type: SpeakingQuestionType;
  question: string;
  model_answer: string;
  expected_concepts: string[];
  semantic_criteria: string[];
}

export interface RawSpeakingQuestions {
  questions: RawSpeakingQuestion[];
}

export const speakingQuestionsSchema: JsonSchema = {
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
          question_type: {
            type: "string",
            enum: [
              "direct_information",
              "sequence_of_events",
              "speaker_intention",
              "reason_or_purpose",
              "simple_inference",
            ],
          },
          question: { type: "string" },
          model_answer: { type: "string" },
          expected_concepts: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string" },
          },
          semantic_criteria: {
            type: "array",
            minItems: 1,
            maxItems: 6,
            items: { type: "string" },
          },
        },
        required: [
          "difficulty",
          "question_type",
          "question",
          "model_answer",
          "expected_concepts",
          "semantic_criteria",
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

export function speakingQuestionsPrompt(input: {
  languageLevel: string;
  japaneseStory: string;
  grammarPatterns: string[];
}): string {
  return `
Create exactly 5 Japanese speaking questions from the following story.

Language level: ${input.languageLevel}

Story:
${input.japaneseStory}

Grammar patterns:
${pythonStringList(input.grammarPatterns)}

Requirements:
- The learner will answer every question aloud in Japanese.
- Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.
- Use each question type exactly once:
  - Direct information
  - Sequence of events
  - Speaker intention
  - Reason or purpose
  - Simple inference
- Direct information and sequence of events must be easy.
- Speaker intention and reason or purpose must be medium.
- Simple inference must be hard.
- Base every question and answer only on information in the story.
- Write every question and model answer in natural Japanese appropriate for ${input.languageLevel}.
- Model answers must be short, complete Japanese sentences.
- Expected concepts must describe the meaning required for a correct answer.
- Semantic criteria must accept natural answers with equivalent meaning and must not require exact wording.
- Use the provided grammar patterns naturally when they fit; do not force an unnatural answer.
- Do not reveal the answer in the question.
- Return only the required JSON.
`;
}

const expectedDifficulty: Record<SpeakingQuestionType, RawSpeakingDifficulty> = {
  direct_information: "easy",
  sequence_of_events: "easy",
  speaker_intention: "medium",
  reason_or_purpose: "medium",
  simple_inference: "hard",
};

function hasJapanese(value: unknown): value is string {
  return typeof value === "string" &&
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

export function speakingQuestionIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Speaking response must be an object."];
  }
  const questions = (value as Record<string, unknown>).questions;
  if (!Array.isArray(questions) || questions.length !== 5) {
    return ["Speaking response needs exactly five questions."];
  }
  const issues: string[] = [];
  const seenTypes = new Set<string>();
  const counts = { easy: 0, medium: 0, hard: 0 };
  questions.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issues.push(`Speaking question ${index + 1} must be an object.`);
      return;
    }
    const item = candidate as Record<string, unknown>;
    const type = item.question_type as SpeakingQuestionType;
    const difficulty = item.difficulty as RawSpeakingDifficulty;
    if (type in expectedDifficulty) {
      if (seenTypes.has(type)) issues.push(`Speaking question type ${type} is repeated.`);
      seenTypes.add(type);
      if (difficulty !== expectedDifficulty[type]) {
        issues.push(`Speaking question type ${type} has the wrong difficulty.`);
      }
    }
    if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
      counts[difficulty] += 1;
    }
    if (!hasJapanese(item.question)) {
      issues.push(`Speaking question ${index + 1} must be written in Japanese.`);
    }
    if (!hasJapanese(item.model_answer)) {
      issues.push(`Speaking model answer ${index + 1} must be written in Japanese.`);
    }
    for (const [field, label] of [
      [item.expected_concepts, "expected concepts"],
      [item.semantic_criteria, "semantic criteria"],
    ] as const) {
      if (
        !Array.isArray(field) ||
        field.length < 1 ||
        field.length > 6 ||
        field.some((entry) => typeof entry !== "string" || entry.trim().length < 1)
      ) {
        issues.push(`Speaking ${label} ${index + 1} must contain one to six non-empty strings.`);
      }
    }
  });
  if (seenTypes.size !== 5) issues.push("Speaking must use all five question types once.");
  if (counts.easy !== 2 || counts.medium !== 2 || counts.hard !== 1) {
    issues.push("Speaking needs two easy, two medium, and one hard question.");
  }
  return [...new Set(issues)];
}
