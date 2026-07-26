import { describe, expect, it } from "vitest";
import {
  buildGenerateContentRequest,
  buildInteractionsRequest,
  generateContentUrl,
} from "@/lib/gemini/api-request";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
};

describe("Gemini structured request builders", () => {
  it("builds the current generateContent response-format envelope", () => {
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
        responseFormat: {
          text: {
            mimeType: "application/json",
            schema,
          },
        },
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
});
