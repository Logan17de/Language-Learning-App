import { describe, expect, it } from "vitest";
import {
  answerSafeInspectableTerms,
  questionAllowsTappableWords,
} from "@/lib/lesson-question-inspection";
import type { StoryWord } from "@/types/lesson";

function word(
  id: string,
  surface: string,
  reading: string,
  meaning: string,
): StoryWord {
  return {
    id,
    libraryId: id,
    libraryType: "vocabulary",
    position: 0,
    surface,
    reading,
    meaning,
    scriptType: /\p{Script=Han}/u.test(surface) ? "kanji" : "hiragana",
    baseMeaningScore: 100,
    baseRecognitionScore: 100,
    basePronunciationScore: 100,
  };
}

describe("answer-safe question inspection", () => {
  const tested = word("target", "担当者", "たんとうしゃ", "person in charge");
  const context = word("office", "会社", "かいしゃ", "company");

  it("keeps standalone reading questions completely untappable", () => {
    expect(questionAllowsTappableWords("")).toBe(false);
    expect(
      answerSafeInspectableTerms({
        enabled: false,
        prompt: 'What is the correct reading of "担当者"?',
        correctAnswer: "たんとうしゃ",
        targetItemIds: [tested.libraryId!],
        terms: [tested, context],
      }),
    ).toEqual([]);
  });

  it("allows context help while excluding the tested word and answer-bearing terms", () => {
    expect(questionAllowsTappableWords("会社の担当者に聞きました。")).toBe(true);
    expect(
      answerSafeInspectableTerms({
        enabled: true,
        prompt: 'Which word is closest to "担当者" in this context?',
        correctAnswer: "たんとうしゃ",
        targetItemIds: [],
        terms: [tested, context],
      }),
    ).toEqual([context]);
  });

  it("protects canonical target IDs even when the prompt does not repeat them", () => {
    expect(
      answerSafeInspectableTerms({
        enabled: true,
        prompt: "Choose the best word for the blank.",
        correctAnswer: "別の答え",
        targetItemIds: [tested.libraryId!],
        terms: [tested, context],
      }),
    ).toEqual([context]);
  });
});
