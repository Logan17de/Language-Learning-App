import { describe, expect, it } from "vitest";
import { parseJsonOrJsonl } from "../lib/openai/structured-text";

describe("OpenAI structured text compatibility", () => {
  it("parses a normal JSON story response", () => {
    expect(parseJsonOrJsonl('{"japanese_story":"猫です。"}')).toEqual({
      japanese_story: "猫です。",
    });
  });

  it("merges an object-based JSONL story response", () => {
    const response = [
      '{"selected_interest":"Cats"}',
      '{"japanese_title":"猫の一日"}',
      '{"japanese_story":"猫です。"}',
      '{"english_translation":"It is a cat."}',
    ].join("\n");

    expect(parseJsonOrJsonl(response)).toEqual({
      selected_interest: "Cats",
      japanese_title: "猫の一日",
      japanese_story: "猫です。",
      english_translation: "It is a cat.",
    });
  });

  it("accepts fenced JSONL and rejects non-object record streams", () => {
    expect(parseJsonOrJsonl('```jsonl\n{"a":1}\n{"b":2}\n```')).toEqual({
      a: 1,
      b: 2,
    });
    expect(() => parseJsonOrJsonl("1\n2")).toThrow(
      "neither JSON nor object-based JSONL",
    );
  });
});
