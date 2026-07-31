import { describe, expect, it } from "vitest";
import {
  buildOpenAIResponsesRequest,
  openAIResponseSchemaName,
  openAIResponsesUrl,
  simplifyOpenAIJsonSchema,
} from "@/lib/openai/api-request";

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
  },
  required: ["title"],
};

describe("OpenAI structured request builder", () => {
  it("builds a stateless GPT-5.6 Luna Responses API request", () => {
    expect(openAIResponsesUrl("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1/responses",
    );
    expect(buildOpenAIResponsesRequest({
      model: "gpt-5.6-luna",
      prompt: "Create a lesson.",
      schema,
      schemaName: "story-only draft",
      reasoningEffort: "low",
    })).toEqual({
      model: "gpt-5.6-luna",
      input: "Create a lesson.",
      reasoning: { effort: "low" },
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "aiko_story-only_draft",
          schema,
          strict: false,
        },
      },
      store: false,
    });
  });

  it("creates a safe JSON Schema response name", () => {
    expect(openAIResponseSchemaName("語彙 & grammar approval!!!")).toBe(
      "aiko_grammar_approval",
    );
    expect(openAIResponseSchemaName("")).toBe("aiko_structured_output");
  });

  it("leaves exact counts and ranges to AIko's deterministic validation", () => {
    expect(simplifyOpenAIJsonSchema({
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
      additionalProperties: false,
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
