import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resolver = readFileSync(
  "lib/gemini/story-library-existing-only.ts",
  "utf8",
);

describe("single kanji inside inflected words stay tappable", () => {
  it("looks inside a segmenter piece when the whole piece has no entry", () => {
    // Intl.Segmenter keeps okurigana attached, so 考える / 強い / 近く never
    // matched a library that holds the bare 考 / 強 / 近. Whole-piece matching
    // alone dropped most single kanji: on one real story it stored 32 of the
    // 57 curated terms, and 24 of the 25 losses were single kanji.
    const resolveLine = resolver.slice(resolver.indexOf("function resolveLine"));
    const noMatch = resolveLine.slice(resolveLine.indexOf("if (!found) {"));

    expect(noMatch).toContain("piece.text.slice(offset, offset + size)");
    expect(noMatch).toContain("uniqueVocabularyMatch(index, surface)");
    // Longest span first, so a curated compound still beats its own characters.
    expect(noMatch).toContain("size = piece.text.length - offset; size > 0; size -= 1");
  });

  it("only falls back where nothing matched, so real words still win", () => {
    const resolveLine = resolver.slice(resolver.indexOf("function resolveLine"));
    // The multi-piece scan runs first and the fallback sits on its failure path.
    expect(resolveLine.indexOf("for (let end = Math.min(pieces.length, cursor + 6)"))
      .toBeLessThan(resolveLine.indexOf("if (!found) {"));
  });
});
