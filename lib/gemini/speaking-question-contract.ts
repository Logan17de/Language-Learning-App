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
- The hard sentence may combine story details and a supplied grammar pattern, but it must remain one readable sentence.
- Ground every sentence in the supplied story, characters, events, or topic.
- Do not use interrogative sentences, question marks, instructions, dialogue labels, translations, or answers.
- Do not repeat a sentence.
- Return only the required JSON.
`;
}

function hasJapanese(value: unknown): value is string {
  return typeof value === "string" &&
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value);
}

export function speakingReadAloudIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Speaking response must be an object."];
  }
  const sentences = (value as Record<string, unknown>).sentences;
  if (!Array.isArray(sentences) || sentences.length !== 5) {
    return ["Speaking response needs exactly five read-aloud sentences."];
  }
  const issues: string[] = [];
  const counts = { easy: 0, medium: 0, hard: 0 };
  const seen = new Set<string>();
  sentences.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      issues.push(`Speaking sentence ${index + 1} must be an object.`);
      return;
    }
    const item = candidate as Record<string, unknown>;
    const difficulty = item.difficulty as RawSpeakingDifficulty;
    if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
      counts[difficulty] += 1;
    }
    if (!hasJapanese(item.sentence)) {
      issues.push(`Speaking sentence ${index + 1} must be written in Japanese.`);
      return;
    }
    const sentence = item.sentence.normalize("NFKC").trim();
    if (/[?？]/u.test(sentence)) {
      issues.push(`Speaking sentence ${index + 1} must not be a question.`);
    }
    if (seen.has(sentence)) {
      issues.push(`Speaking sentence ${index + 1} is repeated.`);
    }
    seen.add(sentence);
  });
  if (counts.easy !== 2 || counts.medium !== 2 || counts.hard !== 1) {
    issues.push("Speaking needs two easy, two medium, and one hard read-aloud sentence.");
  }
  return [...new Set(issues)];
}
