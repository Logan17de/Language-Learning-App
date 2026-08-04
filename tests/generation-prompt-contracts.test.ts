import { describe, expect, it } from "vitest";
import {
  storyGenerationPrompt,
  storyGenerationSchema,
} from "@/lib/gemini/story-generation-contract";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentPrompt,
} from "@/lib/gemini/simple-story-enrichment-contract";

describe("tested story and enrichment API contracts", () => {
  it("uses the exact story_test.py generation prompt", () => {
    expect(storyGenerationPrompt({
      languageLevel: "JLPT N5",
      topic: "A boy's proposal to his crush",
      naturalInterests: ["Technology", "Cats"],
      targetGrammar: ["～ながら", "～たいです", "～てもいいです"],
      targetKanji: ["学校", "友達", "食べる", "見る"],
    })).toBe(`
Generate a Japanese language-learning story.

Learner requirements:
- Language level: JLPT N5
- Story topic: A boy's proposal to his crush
- Available learner interests: Technology, Cats
- Target grammar: ～ながら, ～たいです, ～てもいいです
- Target kanji: 学校, 友達, 食べる, 見る

Story requirements:
- The story must primarily focus on the given topic.
- Write one coherent story containing 10–15 natural Japanese sentences.
- Return the Japanese story as one continuous string, not an array.
- Select exactly one learner interest that fits the story naturally.
- When no provided interest fits naturally, choose a suitable interest
  yourself.
- When no learner interests are provided, choose a suitable interest
  yourself.
- Do not force an interest into the story.
- Naturally use every provided target grammar pattern at least once.
- Naturally use every provided target kanji at least once.
- Keep all other vocabulary and grammar appropriate for JLPT N5.
- Make the story engaging, educational, and easy to follow.
- Keep romantic interactions respectful and age-appropriate.
- Use Japanese quotation marks 「」 only for direct speech.
- Do not place narration inside Japanese quotation marks.
- Provide an accurate English translation of the complete story.
- Return the English translation as one continuous string, not an array.
`);
    expect(storyGenerationSchema).toEqual({
      type: "object",
      additionalProperties: false,
      required: [
        "selected_interest",
        "japanese_title",
        "english_title",
        "japanese_story",
        "english_translation",
      ],
      properties: {
        selected_interest: { type: "string" },
        japanese_title: { type: "string" },
        english_title: { type: "string" },
        japanese_story: { type: "string" },
        english_translation: { type: "string" },
      },
    });
  });

  it("uses the exact enrichment_test.py prompt and three-field format", () => {
    expect(storyEnrichmentPrompt("猫を見ました。")).toBe(`
Extract vocabulary from the following Japanese story.

Story:
猫を見ました。

Requirements:
- List every unique vocabulary word exactly as it appears in the story.
- For each word, provide its reading and English meaning.
- Include kanji, hiragana, and katakana words.
- Exclude particles, punctuation, numbers, and duplicate words.
- Do not change words to their dictionary form.
- Return only the required JSON.
`);
    expect(simpleStoryEnrichmentSchema).toEqual({
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
    });
  });
});
