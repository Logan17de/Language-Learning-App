import type { JsonSchema } from "@/lib/openai/structured-output";

export interface RawStoryVocabulary {
  word: string;
  reading: string;
  meaning: string;
}

export interface SimpleStoryEnrichment {
  vocabulary: RawStoryVocabulary[];
}

export const simpleStoryEnrichmentSchema: JsonSchema = {
  type: "object",
  properties: {
    vocabulary: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          reading: { type: "string" },
          meaning: { type: "string" },
        },
        required: ["word", "reading", "meaning"],
        additionalProperties: false,
      },
    },
  },
  required: ["vocabulary"],
  additionalProperties: false,
};

export function storyEnrichmentOutputIssues(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["Vocabulary enrichment response must be an object."];
  }
  const vocabulary = (value as Record<string, unknown>).vocabulary;
  return Array.isArray(vocabulary) && vocabulary.length > 0
    ? []
    : ["Vocabulary enrichment response must not be empty."];
}

export function storyEnrichmentPrompt(japaneseStory: string): string {
  return `
Extract vocabulary from the following Japanese story.

Story:
${japaneseStory}

Requirements:
- List every unique vocabulary word exactly as it appears in the story.
- For each word, provide its reading and English meaning.
- Include kanji, hiragana, and katakana words.
- Exclude particles, punctuation, numbers, and duplicate words.
- Do not change words to their dictionary form.
- Return only the required JSON.
`;
}
