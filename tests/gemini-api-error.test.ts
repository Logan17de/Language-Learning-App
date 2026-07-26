import { describe, expect, it } from "vitest";
import { createGeminiApiError } from "@/lib/gemini/api-error";

describe("Gemini API error handling", () => {
  it("recognizes the nested array response used for invalid API keys", () => {
    const error = createGeminiApiError("gemini-3.1-flash-lite", 400, [{
      error: {
        code: 400,
        message: "API key not valid. Please pass a valid API key.",
        status: "INVALID_ARGUMENT",
        details: [{
          reason: "API_KEY_INVALID",
          domain: "googleapis.com",
        }],
      },
    }]);

    expect(error.message).toContain("Gemini API key is invalid");
    expect(error.message).toContain("GEMINI_API_KEY");
    expect(error.allowFallback).toBe(false);
  });

  it("allows a different model for transient or model-specific failures", () => {
    expect(createGeminiApiError("primary", 429, {
      error: { message: "Quota temporarily exhausted." },
    }).allowFallback).toBe(true);
    expect(createGeminiApiError("primary", 503, {
      error: { message: "Service unavailable." },
    }).allowFallback).toBe(true);
  });

  it("surfaces structured field violations without exposing the request", () => {
    const error = createGeminiApiError("primary", 400, {
      error: {
        message: "Request contains an invalid argument.",
        details: [{
          fieldViolations: [{
            field: "generation_config.response_format.text.schema",
            description: "Schema is too complex.",
          }],
        }],
      },
    });

    expect(error.message).toBe(
      "Gemini rejected the structured request at generation_config.response_format.text.schema: Schema is too complex.",
    );
    expect(error.allowFallback).toBe(false);
  });
});
