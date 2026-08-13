import type { JsonSchema } from "@/lib/openai/structured-output";

export type RawSpeakingDifficulty = "easy" | "medium" | "hard";
export type SpeakingActivityType = "read_aloud";

export interface RawSpeakingSentence {
  difficulty: RawSpeakingDifficulty;
  sentence: string;
}

export interface RawSpeakingSentences {
  sentences: RawSpeakingSentence[];
}

export const speakingReadAloudSchema: JsonSchema = {
  type: "object",
  properties: {
    sentences: {
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
          sentence: { type: "string" },
        },
        required: ["difficulty", "sentence"],
        additionalProperties: false,
      },
    },
  },
  required: ["sentences"],
  additionalProperties: false,
};

function pythonStringList(values: string[]): string {
  return `[${values.map((value) => `'${value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'")}'`).join(", ")}]`;
}

export function speakingReadAloudPrompt(input: {
  languageLevel: string;
  japaneseStory: string;
  grammarPatterns: string[];
}): string {
  return `
Create exactly 5 Japanese sentences for read-aloud speaking practice.

Language level: ${input.languageLevel}

Story:
${input.japaneseStory}

Grammar patterns:
${pythonStringList(input.grammarPatterns)}

Requirements:
- The learner will only read the displayed sentence aloud. Do not ask the learner a question.
- Create exactly 5 sentences: 2 easy, 2 medium, and 1 hard.
- Every item must be one natural Japanese statement appropriate for ${input.languageLevel}.
- Easy sentences should be short and use familiar story vocabulary.
- Medium sentences should be longer and may naturally use one supplied grammar pattern.
- Hard sentences may combine story details and supplied grammar patterns, but must remain readable single sentences.
- The supplied grammar patterns are useful guidance, not a whitelist.
- Ground every sentence in the supplied story, characters, events, or topic.
- Do not use interrogative sentences, question marks, instructions, dialogue labels, translations, or answers.
- Do not repeat a sentence.
- Return only the required JSON.
`;
}

export function speakingReadAloudIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Speaking response must be an object."];
  }
  const sentences = (value as Record<string, unknown>).sentences;
  if (!Array.isArray(sentences) || sentences.length !== 5) {
    return ["Speaking response must contain exactly 5 read-aloud sentences."];
  }
  const difficulties = sentences.map((sentence) =>
    sentence && typeof sentence === "object" && !Array.isArray(sentence)
      ? (sentence as Record<string, unknown>).difficulty
      : null,
  );
  const easy = difficulties.filter((value) => value === "easy").length;
  const medium = difficulties.filter((value) => value === "medium").length;
  const hard = difficulties.filter((value) => value === "hard").length;
  return easy === 2 && medium === 2 && hard === 1
    ? []
    : ["Speaking response must contain 2 easy, 2 medium, and 1 hard sentence."];
}
