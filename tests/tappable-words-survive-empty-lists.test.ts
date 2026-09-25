import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * An empty list is not a missing one, and `??` cannot tell them apart.
 *
 * Reading and Listening rows are stored with `inspectable_terms` set to `[]`
 * when the generator resolved nothing, so every fallback written with `??` kept
 * the empty array and no word in the section could be tapped. This has now been
 * the same defect three times, in three files, so it is pinned here.
 */
const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const listening = readFileSync("components/lesson/listening-phase.tsx", "utf8");
const vocabulary = readFileSync("components/lesson/vocabulary-phase.tsx", "utf8");
const grammar = readFileSync("components/lesson/grammar-phase.tsx", "utf8");

describe("a section with no stored terms still borrows the story's", () => {
  it("does not hand an empty list to the reading passage", () => {
    expect(reading).not.toContain("line.inspectableTerms ?? terms");
    expect(reading).toContain(
      "line.inspectableTerms?.length ? line.inspectableTerms : terms",
    );
  });

  it("falls back to the story words when nothing was resolved", () => {
    const memo = reading.slice(
      reading.indexOf("const terms = useMemo"),
      reading.indexOf("function reveal"),
    );
    expect(memo).toContain("stored.length ? stored");
    expect(memo).toContain("lesson.story.flatMap");
  });

  it("keeps the sections that already test for length", () => {
    expect(listening).toContain("exercise.inspectableTerms?.length");
    expect(vocabulary).toContain("question.inspectableTerms.length");
    expect(grammar).toContain("question.inspectableTerms.length");
  });
});
