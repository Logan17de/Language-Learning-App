import type { JsonSchema } from "@/lib/openai/structured-output";

export const STORY_MIN_SENTENCES = 10;
export const STORY_MAX_SENTENCES = 15;

export const storyGenerationSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "japanese_title",
    "english_title",
    "japanese_story",
    "english_translation",
  ],
  properties: {
    japanese_title: { type: "string" },
    english_title: { type: "string" },
    japanese_story: { type: "string" },
    english_translation: { type: "string" },
  },
};

export function storyGenerationPrompt(input: {
  languageLevel: string;
  topic: string;
  targetGrammar: string[];
  targetKanji: string[];
}): string {
  const grammarText = input.targetGrammar.length > 0
    ? input.targetGrammar.join(", ")
    : "No target grammar was provided.";
  const kanjiText = input.targetKanji.length > 0
    ? input.targetKanji.join(", ")
    : "No target kanji was provided.";

  return `
Generate a Japanese language-learning story.

Learner requirements:
- Language level: ${input.languageLevel}
- Story topic: ${input.topic}
- Target grammar: ${grammarText}
- Target kanji: ${kanjiText}

Story requirements:
- The story must primarily focus on the given topic.
- Write one coherent story containing 10–15 natural Japanese sentences.
- Return the Japanese story as one continuous string, not an array.
- Naturally use every provided target grammar pattern at least once.
- Naturally use every provided target kanji at least once.
- Keep all other vocabulary and grammar appropriate for ${input.languageLevel}.
- Make the story engaging, educational, and easy to follow.
- Keep romantic interactions respectful and age-appropriate.
- Use Japanese quotation marks 「」 only for direct speech.
- Do not place narration inside Japanese quotation marks.
- Provide an accurate English translation of the complete story.
- Return the English translation as one continuous string, not an array.
`;
}
