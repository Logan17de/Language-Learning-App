import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resolver = readFileSync(
  "lib/gemini/story-library-existing-only.ts",
  "utf8",
);
const catalog = readFileSync(
  "lib/curated-vocabulary-catalog.ts",
  "utf8",
);

describe("story tappability comes only from the existing library", () => {
  it("matches every exact library occurrence without asking a model", () => {
    expect(resolver).toContain("matchCuratedStoryVocabularyOccurrences");
    expect(resolver).toContain("story_vocabulary_enrichments");
    expect(resolver).toContain("vocabulary_records");
    expect(resolver).not.toContain("generateStructured");
    expect(resolver).not.toContain("Intl.Segmenter");
  });

  it("keeps the longest non-overlapping library term", () => {
    const matcher = catalog.slice(
      catalog.indexOf("export function matchCuratedStoryVocabularyOccurrences"),
    );
    expect(matcher).toContain("(right.end - right.start) - (left.end - left.start)");
    expect(matcher).toContain("start < occupiedUntil");
  });
});
