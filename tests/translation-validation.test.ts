import { describe, expect, it, vi } from "vitest";
import {
  translationEvaluationOutputIssues,
  translationEvaluationPrompt,
  translationEvaluationSchema,
  type TranslationEvaluation,
} from "@/lib/gemini/translation-question-contract";
import {
  normalizeTranslationForExactMatch,
  translationAnswerData,
  validateTranslationAttempt,
} from "@/lib/lesson/translation-validation";

function aiResult(correct: true): TranslationEvaluation;
function aiResult(correct: false): TranslationEvaluation;
function aiResult(correct: boolean): TranslationEvaluation {
  return correct
    ? {
        correct: true,
        feedback: "Natural and correct.",
      }
    : {
        correct: false,
        feedback: "The required grammar is missing.",
        suggestion: "Use the required grammar pattern.",
      };
}

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

  it("calls AI for a different answer and accepts a valid natural alternative without suggestion content", async () => {
    const evaluateWithAi = vi.fn(async () => aiResult(true));
    const storedModelAnswer = "面接のあとで会社について話しました。";

    const result = await validateTranslationAttempt({
      learnerAnswer: "面接が終わってから、その会社のことを話しました。",
      modelAnswer: storedModelAnswer,
      evaluateWithAi,
    });

    expect(evaluateWithAi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      correct: true,
      feedback: "Natural and correct.",
      revealAnswer: storedModelAnswer,
      validationSource: "ai",
    });
    expect(result.suggestion).toBeUndefined();
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
  });

  it("retires suggestedAnswer and conditionally permits suggestion only for incorrect evaluations", () => {
    expect(translationEvaluationSchema.required).toEqual(["correct", "feedback"]);
    expect(JSON.stringify(translationEvaluationSchema)).not.toContain("suggestedAnswer");

    const prompt = translationEvaluationPrompt({
      english: "I study Japanese while working.",
      targetPattern: "～ながら",
      targetMeaning: "while doing",
      modelAnswer: "仕事をしながら日本語を勉強しています。",
      learnerAnswer: "仕事をしつつ日本語を勉強しています。",
    });
    expect(prompt).toContain("Omit suggestion");
    expect(prompt).toContain("Do not generate a correction, refinement, alternative answer, or suggestion");
    expect(prompt).toContain("Do not generate a second Japanese answer");
    expect(prompt).not.toContain("suggestedAnswer");

    expect(
      translationEvaluationOutputIssues({
        correct: true,
        feedback: "Natural and correct.",
      }),
    ).toEqual([]);
    expect(
      translationEvaluationOutputIssues({
        correct: true,
        feedback: "Natural and correct.",
        suggestion: "Try another wording.",
      }),
    ).toContain("Correct translation validation must not include a suggestion.");
    expect(
      translationEvaluationOutputIssues({
        correct: false,
        feedback: "The required grammar is missing.",
      }),
    ).toContain("Incorrect translation validation needs a non-empty suggestion.");
    expect(
      translationEvaluationOutputIssues({
        correct: false,
        feedback: "The required grammar is missing.",
        suggestion: "Use the required grammar pattern.",
      }),
    ).toEqual([]);
    expect(
      translationEvaluationOutputIssues({
        correct: true,
        feedback: "Natural and correct.",
        suggestedAnswer: "別の答え",
      }),
    ).toContain("Translation validation must not generate suggestedAnswer.");
  });

  it("returns a finalized persisted verdict without a second AI call or accepting a changed attempt", async () => {
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
    expect(result.correct).not.toBe(aiResult(true).correct);
  });
});
