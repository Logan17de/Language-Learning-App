import { describe, expect, it } from "vitest";
import { buildOpenAIResponsesRequest } from "@/lib/openai/api-request";
import {
  translationEvaluationOutputIssues,
  translationEvaluationPrompt,
  translationEvaluationSchema,
} from "@/lib/gemini/translation-question-contract";

describe("Translation evaluation contract", () => {
  it("keeps the strict provider schema fully required with nullable suggestion", () => {
    expect(translationEvaluationSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["correct", "feedback", "suggestion"],
      properties: {
        correct: { type: "boolean" },
        feedback: { type: "string" },
        suggestion: { type: ["string", "null"] },
      },
    });
    expect(translationEvaluationSchema.properties).not.toHaveProperty("suggestedAnswer");

    const request = buildOpenAIResponsesRequest({
      model: "gpt-test",
      prompt: "test",
      schema: translationEvaluationSchema,
      schemaName: "grammar_translation_validation",
      reasoningEffort: "none",
      strictSchema: true,
      exactSchemaName: true,
    });
    const text = request.text as Record<string, unknown>;
    const format = text.format as Record<string, unknown>;
    const requestSchema = format.schema as Record<string, unknown>;
    const properties = requestSchema.properties as Record<string, unknown>;
    const required = requestSchema.required as string[];

    expect(format.strict).toBe(true);
    expect(format.name).toBe("grammar_translation_validation");
    expect([...required].sort()).toEqual(Object.keys(properties).sort());
    expect((properties.suggestion as Record<string, unknown>).type)
      .toEqual(["string", "null"]);
  });

  it("asks correct evaluations for null suggestion and incorrect evaluations for one suggestion", () => {
    const prompt = translationEvaluationPrompt({
      english: "I want to go to the station.",
      targetPattern: "～たい",
      targetMeaning: "want to",
      modelAnswer: "駅へ行きたいです。",
      learnerAnswer: "駅に行きたいです。",
    });

    expect(prompt).toContain("If correct: return a brief correctness explanation and set suggestion to null.");
    expect(prompt).toContain("Do not generate a correction, refinement, alternative answer, or suggestion.");
    expect(prompt).toContain("If incorrect: explain the specific problem and set suggestion to one concise, learner-friendly improvement suggestion.");
    expect(prompt).toContain("Do not generate a second Japanese answer.");
    expect(prompt).not.toContain("suggestedAnswer");
  });

  it("requires null suggestion when the answer is correct", () => {
    expect(translationEvaluationOutputIssues({
      correct: true,
      feedback: "The meaning and target grammar are both natural.",
      suggestion: null,
    })).toEqual([]);

    expect(translationEvaluationOutputIssues({
      correct: true,
      feedback: "The meaning and target grammar are both natural.",
      suggestion: "Try a different phrasing.",
    })).toContain("Translation validation needs null suggestion when the answer is correct.");

    expect(translationEvaluationOutputIssues({
      correct: true,
      feedback: "The meaning and target grammar are both natural.",
    })).toContain("Translation validation needs null suggestion when the answer is correct.");
  });

  it("requires a non-empty string suggestion when the answer is incorrect", () => {
    expect(translationEvaluationOutputIssues({
      correct: false,
      feedback: "The required grammar pattern is missing.",
      suggestion: "Use ～たい to express the intended desire.",
    })).toEqual([]);

    expect(translationEvaluationOutputIssues({
      correct: false,
      feedback: "The required grammar pattern is missing.",
      suggestion: null,
    })).toContain("Translation validation needs suggestion when the answer is incorrect.");
  });
});
