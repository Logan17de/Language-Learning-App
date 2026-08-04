import { describe, expect, it } from "vitest";
import {
  storyGenerationPrompt,
  storyGenerationSchema,
} from "@/lib/gemini/story-generation-contract";
import {
  simpleStoryEnrichmentSchema,
  storyEnrichmentPrompt,
} from "@/lib/gemini/simple-story-enrichment-contract";
import {
  filterStoryGrammarPatterns,
  grammarQuestionFormats,
  grammarQuestionsPrompt,
  grammarQuestionsSchema,
} from "@/lib/gemini/grammar-question-contract";
import {
  filterStoryPracticeKanji,
  vocabularyQuestionFormats,
  vocabularyQuestionsPrompt,
  vocabularyQuestionsSchema,
} from "@/lib/gemini/vocabulary-question-contract";
import {
  readingPassagePrompt,
  readingPassageSchema,
  readingQuestionsPrompt,
  readingQuestionsSchema,
} from "@/lib/gemini/reading-comprehension-contract";
import {
  listeningQuestionsPrompt,
  listeningQuestionsSchema,
} from "@/lib/gemini/listening-question-contract";
import {
  speakingReadAloudIssues,
  speakingReadAloudPrompt,
  speakingReadAloudSchema,
} from "@/lib/gemini/speaking-question-contract";

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

  it("uses the exact vocab_test.py prompt and response format", () => {
    expect(vocabularyQuestionsPrompt({
      japaneseStory: "学校へ行きました。",
      knownKanji: ["学", "校"],
      questionFormats: [{
        id: 1,
        difficulty: ["easy"],
        name: "Kanji to Reading",
        question: 'What is the correct reading of "<KANJI_WORD>"?',
      }],
    })).toBe(`
Create vocabulary and kanji questions from this Japanese story.

Story:
学校へ行きました。

Kanji:
['学', '校']

Question formats:
[{"id": 1, "difficulty": ["easy"], "name": "Kanji to Reading", "question": "What is the correct reading of \\"<KANJI_WORD>\\"?"}]

Requirements:
- Use only the provided question formats.
- Use vocabulary and kanji from the story.
- Create exactly 13 questions: 6 easy, 4 medium, and 3 hard.
- Every question must have four different choices and one correct answer.
`);
    expect(vocabularyQuestionFormats).toHaveLength(16);
    expect(vocabularyQuestionFormats.map((format) => format.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
    expect(vocabularyQuestionsSchema).toMatchObject({
      type: "object",
      required: ["questions"],
      additionalProperties: false,
      properties: {
        questions: {
          type: "array",
          items: {
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
    });
  });

  it("passes only story kanji found in the known-or-target union", () => {
    expect(filterStoryPracticeKanji({
      japaneseStory: "学校で友達と未知の本を読みます。",
      knownKanji: ["学", "友", "達"],
      targetKanji: ["校", "本"],
    })).toEqual(["学", "校", "友", "達", "本"]);
  });

  it("uses the corrected grammar_test.py contract and grammar formats", () => {
    expect(grammarQuestionsPrompt({
      japaneseStory: "音楽を聞きながら、学校へ行きます。",
      targetGrammarPatterns: ["～ながら"],
      questionFormats: [{
        id: "1",
        difficulty: ["easy"],
        name: "Fill in the Blank",
        question: "Choose the correct grammar to complete the sentence.",
        sentence: "<JP_SENTENCE_WITH_BLANK>",
      }],
    })).toBe(`
Create grammar questions from this Japanese story.

Story:
音楽を聞きながら、学校へ行きます。

Grammar patterns:
['～ながら']

Question formats:
[{"id": "1", "difficulty": ["easy"], "name": "Fill in the Blank", "question": "Choose the correct grammar to complete the sentence.", "sentence": "<JP_SENTENCE_WITH_BLANK>"}]

Requirements:
- Use only the provided question formats.
- Use only the provided grammar patterns that appear in the story.
- Create story-related questions in the most appropriate format for each pattern and difficulty.
- Create exactly 10 questions: 3 easy, 4 medium, and 3 hard.
- Every question must have four different choices and one correct answer.
- Do not create questions using grammar patterns that do not appear in the story.
- Follow the provided question formats exactly.
- Return only the required JSON.
`);
    expect(grammarQuestionFormats).toHaveLength(10);
    expect(grammarQuestionFormats.map((format) => format.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => String(index + 1)),
    );
    expect(grammarQuestionsSchema).toMatchObject({
      type: "object",
      required: ["questions"],
      additionalProperties: false,
      properties: {
        questions: {
          type: "array",
          items: {
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
    });
  });

  it("uses the five-sentence read-aloud speaking contract", () => {
    const prompt = speakingReadAloudPrompt({
      languageLevel: "JLPT N4",
      japaneseStory: "ゆきさんは駅へ行きました。それから友達に会いました。",
      grammarPatterns: ["〜てから"],
    });
    expect(prompt).toContain("Create exactly 5 Japanese sentences for read-aloud speaking practice");
    expect(prompt).toContain("2 easy, 2 medium, and 1 hard");
    expect(prompt).toContain("Do not ask the learner a question");
    expect(prompt).toContain("Do not use interrogative sentences");
    expect(speakingReadAloudSchema).toMatchObject({
      type: "object",
      required: ["sentences"],
      additionalProperties: false,
      properties: {
        sentences: {
          minItems: 5,
          maxItems: 5,
          items: {
            required: ["difficulty", "sentence"],
            additionalProperties: false,
          },
        },
      },
    });
    expect(speakingReadAloudIssues({
      sentences: [
        { difficulty: "easy", sentence: "ゆきさんは駅へ行きました。" },
        { difficulty: "easy", sentence: "ゆきさんは友達に会いました。" },
        { difficulty: "medium", sentence: "駅へ行ってから、友達に会いました。" },
        { difficulty: "medium", sentence: "二人は駅の近くで楽しく話しました。" },
        { difficulty: "hard", sentence: "友達に会うために駅へ行ったので、ゆきさんはうれしそうでした。" },
      ],
    })).toEqual([]);
  });

  it("uses the reading_test.py format after a story-format reading call", () => {
    const passagePrompt = readingPassagePrompt({
      languageLevel: "JLPT N5",
      topic: "A day at school",
      naturalInterests: ["Books"],
      targetGrammar: ["～たい"],
      targetKanji: ["学"],
    });
    expect(passagePrompt).toContain("Generate a Japanese language-learning story for reading.");
    expect(passagePrompt).toContain("Write one coherent story containing 10–15 natural Japanese sentences.");
    expect(readingPassageSchema).toBe(storyGenerationSchema);

    expect(readingQuestionsPrompt({
      languageLevel: "JLPT N5",
      japaneseStory: "太郎は学校へ行きました。",
    })).toBe(`
Create reading-comprehension questions from the following Japanese story.

Language level: JLPT N5

Story:
太郎は学校へ行きました。

Requirements:
- Base every question only on the story.
- Write essay-style questions in Japanese.
- Require answers in short, complete Japanese sentences.
- Include direct-detail, sequence, reason, and simple inference questions.
- Keep the questions appropriate for JLPT N5.
- Do not create questions that cannot be answered from the story.
- Do not copy full sentences from the story as answers unless necessary.
- Easy questions must have answers stated directly in the story.
- Medium questions must combine information from two or more story sentences.
- Hard questions must require a simple inference supported by the story.
- Return only the required JSON.
`);
    expect(readingQuestionsSchema).toEqual({
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
              question: { type: "string" },
              answer: { type: "string" },
            },
            required: ["difficulty", "question", "answer"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    });
  });

  it("uses the exact listening_test.py prompt and response format", () => {
    expect(listeningQuestionsPrompt({
      languageLevel: "JLPT N5",
      knownPatterns: [],
    })).toBe(`
Create exactly 5 listening-comprehension questions for JLPT N5 learners.

grammar patterns:
[]

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
- Keep everything appropriate for JLPT N5.
`);
    expect(listeningQuestionsSchema).toEqual({
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
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
            required: ["difficulty", "conversation", "question", "choices", "answer"],
            additionalProperties: false,
          },
        },
      },
      required: ["questions"],
      additionalProperties: false,
    });
  });

  it("passes only target grammar patterns that occur in the story", () => {
    expect(filterStoryGrammarPatterns({
      japaneseStory: "音楽を聞きながら、学校へ行きます。",
      targetGrammarPatterns: ["～ながら", "～てもいいですか", "～たい"],
    })).toEqual(["～ながら"]);
  });
});
