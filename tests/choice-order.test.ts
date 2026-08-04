import { describe, expect, it } from "vitest";
import { shuffledChoices } from "@/lib/choice-order";

describe("AI-generated choice ordering", () => {
  it("changes a unique model-provided order without mutating it", () => {
    const original = ["first", "second", "third", "correct"];
    const reordered = shuffledChoices(original, "question-one");

    expect(reordered).not.toEqual(original);
    expect([...reordered].sort()).toEqual([...original].sort());
    expect(original).toEqual(["first", "second", "third", "correct"]);
    expect(reordered).toContain("correct");
  });

  it("keeps the reordered choices stable for the same question", () => {
    const choices = ["A", "B", "C", "D"];

    expect(shuffledChoices(choices, "stable-seed")).toEqual(
      shuffledChoices(choices, "stable-seed"),
    );
  });
});
