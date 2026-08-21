import { describe, expect, it } from "vitest";
import {
  translationEvaluationOutputIssues,
  translationEvaluationPrompt,
  translationEvaluationSchema,
} from "@/lib/gemini/translation-question-contract";

describe("Translation evaluation contract", () => {
  it("does not require or expose suggestedAnswer in validation output", () => {
    expect(translationEvaluationSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["correct", "feedback"],
      properties: {
        correct: { type: "boolean" },
        feedback: { type: "string" },
        suggestion: { type: "string" },
      },
    });
    expect(translationEvaluationSchema.required).not.toContain("suggestedAnswer");
    expect(translationEvaluationSchema.properties).not.toHaveProperty("suggestedAnswer");
  });

  it("asks correct evaluations to omit correction content and incorrect evaluations to provide one suggestion", () => {
    const prompt = translationEvaluationPrompt({
      english: "I want to go to the station.",
      targetPattern: "～たい",
      targetMeaning: "want to",
      modelAnswer: "駅へ行きたいです。",
      learnerAnswer: "駅に行きたいです。",
    });

    expect(prompt).toContain("If correct: return a brief correctness explanation.");
    expect(prompt).toContain("Do not generate a correction, refinement, alternative answer, or suggestion.");
    expect(prompt).toContain("Omit suggestion.");
    expect(prompt).toContain("If incorrect: explain the specific problem and provide one concise, learner-friendly improvement suggestion.");
    expect(prompt).toContain("Do not generate a second Japanese answer.");
    expect(prompt).not.toContain("suggestedAnswer");
  });

  it("accepts correct output only without suggestion", () => {
    expect(translationEvaluationOutputIssues({
      correct: true,
      feedback: "The meaning and target grammar are both natural.",
    })).toEqual([]);

    expect(translationEvaluationOutputIssues({
      correct: true,
      feedback: "The meaning and target grammar are both natural.",
      suggestion: "Try a different phrasing.",
    })).toContain("Translation validation must omit suggestion when the answer is correct.");
  });

  it("requires a non-empty suggestion only when the answer is incorrect", () => {
    expect(translationEvaluationOutputIssues({
      correct: false,
      feedback: "The required grammar pattern is missing.",
      suggestion: "Use ～たい to express the intended desire.",
    })).toEqual([]);

    expect(translationEvaluationOutputIssues({
      correct: false,
      feedback: "The required grammar pattern is missing.",
    })).toContain("Translation validation needs suggestion when the answer is incorrect.");
  });
});
