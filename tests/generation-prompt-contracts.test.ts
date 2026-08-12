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
      naturalInterests: ["Books", "Sports"],
      targetGrammar: ["～ながら", "～たいです", "～てもいいです"],
      targetKanji: ["学", "校", "友", "食", "見"],
    });
    expect(prompt).toContain("Generate a Japanese language-learning story.");
    expect(prompt).toContain("Write one coherent story containing 10–15 natural Japanese sentences.");
    expect(prompt).toContain("Naturally use every provided target grammar pattern at least once.");
    expect(prompt).toContain("Naturally use every provided target kanji at least once.");
    expect(prompt).toContain("one continuous string, not an array");
    expect(storyGenerationSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: [
        "selected_interest",
        "japanese_title",
        "english_title",
        "japanese_story",
        "english_translation",
      ],
    });
  });

  it("creates the vocabulary and kanji lesson from fixed story plus five target kanji", () => {
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
    expect(prompt).toContain("Exactly 5 questions should directly practice the five target kanji");
    expect(prompt).toContain("remaining 8 questions");
    expect(prompt).toContain("Create exactly 13 questions: 6 easy, 4 medium, and 3 hard.");
    expect(vocabularyQuestionFormats).toHaveLength(16);
    expect(vocabularyQuestionsSchema).toMatchObject({
      type: "object",
      required: ["kanjiTeaching", "questions"],
      additionalProperties: false,
      properties: {
        kanjiTeaching: { type: "array", minItems: 5, maxItems: 5 },
        questions: { type: "array", minItems: 13, maxItems: 13 },
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

  it("creates grammar teaching and questions from exactly the selected patterns", () => {
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
    expect(prompt).toContain("Create exactly 10 questions: 3 easy, 4 medium, and 3 hard.");
    expect(grammarQuestionFormats).toHaveLength(10);
    expect(grammarQuestionsSchema).toMatchObject({
      type: "object",
      required: ["grammarTeaching", "questions"],
      additionalProperties: false,
      properties: {
        grammarTeaching: { type: "array", minItems: 3, maxItems: 3 },
        questions: { type: "array", minItems: 10, maxItems: 10 },
      },
    });
  });

  it("passes only target grammar patterns that occur in the story", () => {
    expect(filterStoryGrammarPatterns({
      japaneseStory: "音楽を聞きながら、学校へ行きます。",
      targetGrammarPatterns: ["～ながら", "～てもいいですか", "～たい"],
    })).toEqual(["～ながら"]);
  });

  it("keeps reading as passage generation followed by five comprehension questions", () => {
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

    const questionsPrompt = readingQuestionsPrompt({
      languageLevel: "JLPT N5",
      japaneseStory: "太郎は学校へ行きました。",
    });
    expect(questionsPrompt).toContain("Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.");
    expect(questionsPrompt).toContain("Base every question only on the story.");
    expect(readingQuestionsSchema).toMatchObject({
      type: "object",
      required: ["questions"],
      properties: { questions: { minItems: 5, maxItems: 5 } },
    });
  });

  it("keeps listening at exactly five comprehension exercises", () => {
    const prompt = listeningQuestionsPrompt({
      languageLevel: "JLPT N5",
      knownPatterns: ["～たい"],
    });
    expect(prompt).toContain("Create exactly 5 listening-comprehension questions");
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
        { difficulty: "hard", sentence: "友達に会うために駅へ行ったので、ゆきさんはうれしそうでした。" },
      ],
    })).toEqual([]);
  });
});
