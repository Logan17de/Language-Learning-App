import type { JsonSchema } from "@/lib/openai/structured-output";
import { storyUsesGrammarPattern } from "@/lib/gemini/lesson-validation";

export type RawGrammarQuestionDifficulty = "easy" | "medium" | "hard";

export interface GrammarQuestionFormat {
  id: string;
  difficulty: RawGrammarQuestionDifficulty[];
  name: string;
  question: string;
  sentence?: string;
}

export interface RawGrammarTeaching {
  requestIndex: number;
  meaning: string;
  formation: string;
  usage: string;
  example: string;
  translation: string;
}

export interface RawGrammarQuestion {
  format_id: number;
  difficulty: RawGrammarQuestionDifficulty;
  question: string;
  sentence: string | null;
  choices: string[];
  answer: string;
}

export interface RawGrammarQuestions {
  grammarTeaching: RawGrammarTeaching[];
  questions: RawGrammarQuestion[];
}

export const grammarQuestionFormats: GrammarQuestionFormat[] = [
  { id: "1", difficulty: ["easy"], name: "Fill in the Blank", question: "Choose the correct grammar to complete the sentence.", sentence: "<JP_SENTENCE_WITH_BLANK>" },
  { id: "2", difficulty: ["easy"], name: "Choose the Correct Particle", question: "Choose the correct particle.", sentence: "<JP_SENTENCE_WITH_BLANK>" },
  { id: "3", difficulty: ["easy"], name: "Grammar Meaning", question: 'What does "<GRAMMAR_PATTERN>" express?' },
  { id: "4", difficulty: ["medium"], name: "Sentence Meaning", question: "What is this sentence mainly saying?", sentence: "<JP_SENTENCE>" },
  { id: "5", difficulty: ["medium"], name: "Correct Grammar Usage", question: 'Which sentence correctly uses "<GRAMMAR_PATTERN>"?' },
  { id: "6", difficulty: ["medium"], name: "Error Detection", question: "Which sentence contains the grammar mistake?" },
  { id: "7", difficulty: ["medium"], name: "Sentence Order", question: "Arrange the parts into the correct sentence." },
  { id: "8", difficulty: ["hard"], name: "Context Selection", question: "Choose the grammar that best completes the sentence.", sentence: "<JP_SENTENCE_WITH_BLANK>" },
  { id: "9", difficulty: ["hard"], name: "Similar Grammar", question: "Which grammar pattern best fits this sentence?", sentence: "<JP_SENTENCE>" },
  { id: "10", difficulty: ["hard"], name: "Natural Expression", question: "Which sentence sounds the most natural?" },
];

export const grammarQuestionsSchema: JsonSchema = {
  type: "object",
  properties: {
    grammarTeaching: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["requestIndex", "meaning", "formation", "usage", "example", "translation"],
        properties: {
          requestIndex: { type: "integer", minimum: 0, maximum: 2 },
          meaning: { type: "string" },
          formation: { type: "string" },
          usage: { type: "string" },
          example: { type: "string" },
          translation: { type: "string" },
        },
      },
    },
    questions: {
      type: "array",
      minItems: 7,
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          format_id: { type: "integer" },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          question: { type: "string" },
          sentence: { type: ["string", "null"] },
          choices: {
            type: "array",
            items: { type: "string" },
            minItems: 4,
            maxItems: 4,
          },
          answer: { type: "string" },
        },
        required: [
          "format_id",
          "difficulty",
          "question",
          "sentence",
          "choices",
          "answer",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["grammarTeaching", "questions"],
  additionalProperties: false,
};

function pythonJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(pythonJson).join(", ")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => `${JSON.stringify(key)}: ${pythonJson(child)}`)
      .join(", ")}}`;
  }
  throw new Error("Unsupported grammar question format value.");
}

export function grammarQuestionsPrompt(input: {
  japaneseStory: string;
  targetGrammarPatterns: string[];
  questionFormats?: GrammarQuestionFormat[];
}): string {
  const indexedPatterns = input.targetGrammarPatterns.map((pattern, requestIndex) => ({
    requestIndex,
    pattern,
  }));
  return `
Create AIko's grammar lesson from this fixed Japanese story.

Story:
${input.japaneseStory}

Three target grammar patterns (priority teaching targets, not a question whitelist):
${pythonJson(indexedPatterns)}

Question formats:
${pythonJson(input.questionFormats ?? grammarQuestionFormats)}

Requirements:
- Do not rewrite the story.
- grammarTeaching must contain exactly one entry for requestIndex 0 through 2.
- For each grammarTeaching entry, explain the fixed pattern's meaning, formation, usage, one natural Japanese example, and the English translation of that example. Do not output or replace the pattern itself.
- Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.
- Prefer the supplied target grammar patterns when they make natural, useful questions, but they are guidance rather than a whitelist.
- Questions may also practice other natural grammar from the fixed story when appropriate for the learner level.
- Create story-related questions in the most appropriate format and difficulty.
- Every question must have four different choices and one correct answer.
- Follow the provided question formats exactly.
- Return only the required JSON.
`;
}

export function filterStoryGrammarPatterns(input: {
  japaneseStory: string;
  targetGrammarPatterns: string[];
}): string[] {
  return input.targetGrammarPatterns.filter((pattern) =>
    storyUsesGrammarPattern(input.japaneseStory, pattern),
  );
}
