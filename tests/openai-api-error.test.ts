import { describe, expect, it } from "vitest";
import { createOpenAIApiError } from "@/lib/openai/api-error";

describe("OpenAI API error handling", () => {
  it("recognizes an invalid server-side API key", () => {
    const error = createOpenAIApiError("gpt-5.6-luna", 401, {
      error: {
        message: "Incorrect API key provided.",
        type: "invalid_request_error",
        code: "invalid_api_key",
      },
    });

    expect(error.message).toContain("OpenAI authentication failed");
    expect(error.message).toContain("OPENAI_API_KEY");
    expect(error.allowFallback).toBe(false);
  });

  it("does not hide billing failures behind a model fallback", () => {
    const error = createOpenAIApiError("gpt-5.6-luna", 429, {
      error: {
        message: "You exceeded your current quota.",
        type: "insufficient_quota",
        code: "insufficient_quota",
      },
    });

    expect(error.message).toContain("credits or billing");
    expect(error.allowFallback).toBe(false);
  });

  it("allows an explicitly configured fallback for transient failures", () => {
    expect(createOpenAIApiError("primary", 429, {
      error: { message: "Rate limit reached.", code: "rate_limit_exceeded" },
    }).allowFallback).toBe(true);
    expect(createOpenAIApiError("primary", 503, {
      error: { message: "Service unavailable." },
    }).allowFallback).toBe(true);
  });

  it("surfaces structured request errors without exposing the prompt", () => {
    const error = createOpenAIApiError("gpt-5.6-luna", 400, {
      error: {
        message: "Invalid schema for response_format.",
        type: "invalid_request_error",
        param: "text.format.schema",
        code: "invalid_json_schema",
      },
    });

    expect(error.message).toBe(
      "OpenAI rejected the structured request at text.format.schema: Invalid schema for response_format.",
    );
    expect(error.allowFallback).toBe(false);
  });
});
