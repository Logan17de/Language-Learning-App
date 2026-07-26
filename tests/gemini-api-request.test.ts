import { describe, expect, it } from "vitest";
import {
  buildGenerateContentRequest,
  buildInteractionsRequest,
  generateContentUrl,
  simplifyGeminiJsonSchema,
} from "@/lib/gemini/api-request";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
};

describe("Gemini structured request builders", () => {
  it("builds the generateContent JSON Schema envelope supported by the lesson models", () => {
    expect(generateContentUrl(
      "https://generativelanguage.googleapis.com/v1beta/models/",
      "gemini-3-flash-preview",
    )).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
    );
    expect(buildGenerateContentRequest("Create a lesson.", schema)).toEqual({
      contents: [{
        role: "user",
        parts: [{ text: "Create a lesson." }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: schema,
      },
    });
  });

  it("keeps the revisioned Interactions envelope available as a transport fallback", () => {
    expect(buildInteractionsRequest(
      "gemini-3.1-flash-lite",
      "Repair the lesson.",
      schema,
    )).toEqual({
      model: "gemini-3.1-flash-lite",
      input: "Repair the lesson.",
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
    });
  });

  it("moves complexity-heavy constraints to application validation", () => {
    expect(simplifyGeminiJsonSchema({
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "integer",
            minimum: 1,
            maximum: 64,
          },
        },
        level: {
          type: "string",
          enum: ["N5", "N4"],
        },
      },
    })).toEqual({
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "integer",
          },
        },
        level: {
          type: "string",
          enum: ["N5", "N4"],
        },
      },
    });
  });
});
