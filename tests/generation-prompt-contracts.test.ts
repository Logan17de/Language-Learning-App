import { describe, expect, it } from "vitest";
import {
  storyGenerationPrompt,
  storyGenerationSchema,
} from "@/lib/gemini/story-generation-contract";
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

describe("custom lesson generation prompt contracts", () => {
  it("keeps the first call limited to a continuous story", () => {
    const prompt = storyGenerationPrompt({
      languageLevel: "JLPT N5",
      topic: "A day at school",
      targetGrammar: ["～ながら", "～たいです", "～てもいいです"],
      targetKanji: ["学", "校", "友", "食", "見"],
    });
    expect(prompt).toContain("Generate a Japanese language-learning story.");
    expect(prompt).toContain("Write one coherent story containing 10–15 natural Japanese sentences.");
    expect(prompt).toContain("Naturally use every provided target grammar pattern at least once.");
    expect(prompt).toContain("Naturally use every provided target kanji at least once.");
    expect(prompt).toContain("one continuous string, not an array");
    expect(prompt.toLowerCase()).not.toContain("interest");
    expect(storyGenerationSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "japanese_title",
        "english_title",
        "japanese_story",
        "english_translation",
      ],
    });
  });

  it("creates seven vocabulary and kanji questions while keeping five target teaching cards", () => {
    const prompt = vocabularyQuestionsPrompt({
      japaneseStory: "学校へ行きました。友達と昼ご飯を食べました。",
      targetKanji: ["学", "校", "友", "食", "昼"],
      questionFormats: [{
        id: 1,
        difficulty: ["easy"],
        name: "Kanji to Reading",
        question: 'What is the correct reading of "<KANJI_WORD>"?',
      }],
    });
    expect(prompt).toContain("Create AIko's vocabulary and kanji lesson from this fixed Japanese story.");
    expect(prompt).toContain("kanjiTeaching must contain exactly one entry for requestIndex 0 through 4");
    expect(prompt).toContain("not a question whitelist");
    expect(prompt).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(prompt).toContain("Questions may also practice other useful vocabulary or kanji");
    expect(vocabularyQuestionFormats).toHaveLength(16);
    expect(vocabularyQuestionsSchema).toMatchObject({
      type: "object",
      required: ["kanjiTeaching", "questions"],
      additionalProperties: false,
      properties: {
        kanjiTeaching: { type: "array", minItems: 5, maxItems: 5 },
        questions: { type: "array", minItems: 7, maxItems: 7 },
      },
    });
  });

  it("keeps story-kanji filtering as an identity helper", () => {
    expect(filterStoryPracticeKanji({
      japaneseStory: "学校で友達と未知の本を読みます。",
      knownKanji: ["学", "友", "達"],
      targetKanji: ["校", "本"],
    })).toEqual(["学", "校", "友", "達", "本"]);
  });

  it("creates grammar teaching from selected targets but allows broader story grammar questions", () => {
    const prompt = grammarQuestionsPrompt({
      japaneseStory: "音楽を聞きながら、学校へ行きます。",
      targetGrammarPatterns: ["～ながら", "～たい", "～てもいい"],
      questionFormats: [{
        id: "1",
        difficulty: ["easy"],
        name: "Fill in the Blank",
        question: "Choose the correct grammar to complete the sentence.",
        sentence: "<JP_SENTENCE_WITH_BLANK>",
      }],
    });
    expect(prompt).toContain("Create AIko's grammar lesson from this fixed Japanese story.");
    expect(prompt).toContain("grammarTeaching must contain exactly one entry for requestIndex 0 through 2");
    expect(prompt).toContain("meaning, formation, usage");
    expect(prompt).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(prompt).toContain("guidance rather than a whitelist");
    expect(grammarQuestionFormats).toHaveLength(10);
    expect(grammarQuestionsSchema).toMatchObject({
      type: "object",
      required: ["grammarTeaching", "questions"],
      additionalProperties: false,
      properties: {
        grammarTeaching: { type: "array", minItems: 3, maxItems: 3 },
        questions: { type: "array", minItems: 7, maxItems: 7 },
      },
    });
  });

  it("passes only target grammar patterns that occur in the story for teaching identity selection", () => {
    expect(filterStoryGrammarPatterns({
      japaneseStory: "音楽を聞きながら、学校へ行きます。",
      targetGrammarPatterns: ["～ながら", "～てもいいですか", "～たい"],
    })).toEqual(["～ながら"]);
  });

  it("keeps reading as passage generation followed by five MCQs", () => {
    const passagePrompt = readingPassagePrompt({
      languageLevel: "JLPT N5",
      topic: "A day at school",
      targetGrammar: ["～たい"],
      targetKanji: ["学"],
    });
    expect(passagePrompt).toContain("Generate a Japanese language-learning story.");
    expect(passagePrompt).toContain("Write one coherent story containing 10–15 natural Japanese sentences.");
    expect(passagePrompt.toLowerCase()).not.toContain("interest");
    expect(readingPassageSchema).toBe(storyGenerationSchema);

    const questionsPrompt = readingQuestionsPrompt({
      languageLevel: "JLPT N5",
      japaneseStory: "太郎は学校へ行きました。",
    });
    expect(questionsPrompt).toContain("Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.");
    expect(questionsPrompt).toContain("multiple choice with exactly four distinct choices");
    expect(questionsPrompt).toContain("Base every question only on the passage.");
    expect(readingQuestionsSchema).toMatchObject({
      type: "object",
      required: ["questions"],
      properties: {
        questions: {
          minItems: 5,
          maxItems: 5,
          items: {
            required: ["q_no", "difficulty", "question", "choices", "answer"],
          },
        },
      },
    });
  });

  it("keeps listening at five comprehension exercises", () => {
    const prompt = listeningQuestionsPrompt({
      languageLevel: "JLPT N5",
      knownPatterns: ["～たい"],
    });
    expect(prompt).toContain("Create exactly 5 listening-comprehension questions");
    expect(prompt).toContain("2 easy, 2 medium, and 1 hard");
    expect(prompt).toContain("natural Japanese conversation of 5–10 lines");
    expect(listeningQuestionsSchema).toMatchObject({
      type: "object",
      required: ["questions"],
      properties: { questions: { minItems: 5, maxItems: 5 } },
    });
  });

  it("keeps speaking as five read-aloud sentences", () => {
    const prompt = speakingReadAloudPrompt({
      languageLevel: "JLPT N4",
      japaneseStory: "ゆきさんは駅へ行きました。それから友達に会いました。",
      grammarPatterns: ["〜てから"],
    });
    expect(prompt).toContain("Create exactly 5 Japanese sentences for read-aloud speaking practice");
    expect(prompt).toContain("2 easy, 2 medium, and 1 hard");
    expect(prompt).toContain("Do not ask the learner a question");
    expect(speakingReadAloudSchema).toMatchObject({
      type: "object",
      required: ["sentences"],
      properties: { sentences: { minItems: 5, maxItems: 5 } },
    });
    expect(speakingReadAloudIssues({
      sentences: [
        { difficulty: "easy", sentence: "ゆきさんは駅へ行きました。" },
        { difficulty: "easy", sentence: "ゆきさんは友達に会いました。" },
        { difficulty: "medium", sentence: "駅へ行ってから、友達に会いました。" },
        { difficulty: "medium", sentence: "二人は駅の近くで楽しく話しました。" },
        { difficulty: "hard", sentence: "話しながら歩いていると、二人は新しい店を見つけました。" },
      ],
    })).toEqual([]);
  });
});
