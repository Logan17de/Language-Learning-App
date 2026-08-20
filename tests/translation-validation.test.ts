import { describe, expect, it, vi } from "vitest";
import {
  normalizeTranslationForExactMatch,
  translationAnswerData,
  validateTranslationAttempt,
} from "@/lib/lesson/translation-validation";

const aiResult = (correct: boolean) => ({
  correct,
  feedback: correct ? "Natural and correct." : "The required grammar is missing.",
  suggestion: correct ? "No change needed." : "Use the required grammar pattern.",
  suggestedAnswer: "AIが作った別の答えです。",
});

describe("Translation validation fast path", () => {
  it("accepts a normalized model-answer match without calling AI and persists trusted evidence", async () => {
    const evaluateWithAi = vi.fn(async () => aiResult(false));
    const storedModelAnswer = "私は 学校へ行きます。";

    expect(normalizeTranslationForExactMatch("私は学校へ行きます!"))
      .toBe(normalizeTranslationForExactMatch(storedModelAnswer));

    const result = await validateTranslationAttempt({
      learnerAnswer: "私は学校へ行きます！",
      modelAnswer: storedModelAnswer,
      evaluateWithAi,
    });

    expect(evaluateWithAi).not.toHaveBeenCalled();
    expect(result).toEqual({
      correct: true,
      feedback: "Correct.",
      revealAnswer: storedModelAnswer,
      validationSource: "exact_match",
    });
    expect(translationAnswerData(result, "grammar-1")).toMatchObject({
      serverValidated: true,
      targetItemId: "grammar-1",
      validationSource: "exact_match",
      feedback: "Correct.",
    });
  });

  it("calls AI for a different answer and accepts a valid natural alternative", async () => {
    const evaluateWithAi = vi.fn(async () => aiResult(true));
    const storedModelAnswer = "面接のあとで会社について話しました。";

    const result = await validateTranslationAttempt({
      learnerAnswer: "面接が終わってから、その会社のことを話しました。",
      modelAnswer: storedModelAnswer,
      evaluateWithAi,
    });

    expect(evaluateWithAi).toHaveBeenCalledTimes(1);
    expect(result.correct).toBe(true);
    expect(result.validationSource).toBe("ai");
    expect(result.suggestion).toBeUndefined();
    expect(result.revealAnswer).toBe(storedModelAnswer);
  });

  it("returns concise AI correction guidance while revealing only the original stored answer", async () => {
    const evaluateWithAi = vi.fn(async () => aiResult(false));
    const storedModelAnswer = "仕事をしながら日本語を勉強しています。";

    const result = await validateTranslationAttempt({
      learnerAnswer: "仕事をして日本語を勉強しています。",
      modelAnswer: storedModelAnswer,
      evaluateWithAi,
    });

    expect(evaluateWithAi).toHaveBeenCalledTimes(1);
    expect(result.correct).toBe(false);
    expect(result.feedback).toContain("required grammar");
    expect(result.suggestion).toBe("Use the required grammar pattern.");
    expect(result.revealAnswer).toBe(storedModelAnswer);
    expect(result.revealAnswer).not.toBe(aiResult(false).suggestedAnswer);
  });

  it("returns a finalized persisted result without re-evaluating the answer", async () => {
    const evaluateWithAi = vi.fn(async () => aiResult(true));
    const storedModelAnswer = "駅へ行きたいです。";

    const result = await validateTranslationAttempt({
      learnerAnswer: "あとから変更した答え",
      modelAnswer: storedModelAnswer,
      existing: {
        correct: false,
        answerData: {
          serverValidated: true,
          validationSource: "ai",
          feedback: "The tense is incorrect.",
          suggestion: "Use the past tense.",
        },
      },
      evaluateWithAi,
    });

    expect(evaluateWithAi).not.toHaveBeenCalled();
    expect(result).toEqual({
      correct: false,
      feedback: "The tense is incorrect.",
      suggestion: "Use the past tense.",
      revealAnswer: storedModelAnswer,
      validationSource: "ai",
    });
  });
});
