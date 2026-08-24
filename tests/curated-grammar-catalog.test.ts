import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CURATED_GRAMMAR_FILE,
  curatedGrammarPattern,
  loadCuratedGrammarCatalog,
} from "@/lib/curated-grammar-catalog";

describe("the curated grammar bank", () => {
  it("loads every pattern the file declares", () => {
    const catalog = loadCuratedGrammarCatalog();
    expect(catalog).toHaveLength(641);

    const byLevel = catalog.reduce<Record<string, number>>((counts, entry) => {
      counts[entry.level] = (counts[entry.level] ?? 0) + 1;
      return counts;
    }, {});
    // The file states these counts in its own level headings.
    expect(byLevel).toEqual({ N5: 82, N4: 112, N3: 136, N2: 124, N1: 187 });
  });

  it("carries all four teaching fields for every pattern", () => {
    // A half-parsed entry is worse than none: it would silently replace a
    // model-written explanation with an empty one.
    const incomplete = loadCuratedGrammarCatalog().filter(
      (entry) =>
        !entry.structure ||
        !entry.usage ||
        !entry.exampleJapanese ||
        !entry.exampleEnglish,
    );
    expect(incomplete).toEqual([]);
  });

  it("finds a pattern however its name is written", () => {
    // grammar_records writes the same pattern several ways.
    expect(curatedGrammarPattern("〜ながら")?.pattern).toContain("ながら");
    expect(curatedGrammarPattern("～ながら")?.id).toBe(
      curatedGrammarPattern("ながら")?.id,
    );
    expect(curatedGrammarPattern("あまり～ない")).not.toBeNull();
    // Alternatives listed together are reachable by either half.
    expect(curatedGrammarPattern("です")?.id).toBe("N5_G001");
    expect(curatedGrammarPattern("だ")?.id).toBe("N5_G001");
  });

  it("lets a pattern's own name beat another entry's alternative", () => {
    // じゃない is N3_G031's own name and also half of N5_G002's
    // "じゃない / ではない". The pattern that is named that must win.
    expect(curatedGrammarPattern("じゃない")?.id).toBe("N3_G031");
    expect(curatedGrammarPattern("ではない")?.id).toBe("N5_G002");
  });

  it("returns nothing rather than guessing", () => {
    expect(curatedGrammarPattern("")).toBeNull();
    expect(curatedGrammarPattern("   ")).toBeNull();
    expect(curatedGrammarPattern("not-a-japanese-pattern")).toBeNull();
  });

  it("reads a real entry the way the teaching card needs it", () => {
    const entry = curatedGrammarPattern("上げる");
    expect(entry).toMatchObject({
      id: "N3_G001",
      level: "N3",
      structure: "Verb ます-stem + 上げる",
    });
    expect(entry?.usage).toContain("compound-verb");
    expect(entry?.exampleJapanese).toContain("書き上げました");
    expect(entry?.exampleEnglish).toContain("finished writing");
  });
});

describe("grammar teaching prefers the bank over the model", () => {
  const groups = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");

  it("takes structure, usage and the example from the catalog", () => {
    expect(groups).toContain("const curated = curatedGrammarPattern(target.pattern)");
    expect(groups).toContain("formation: curated?.structure || item.formation");
    expect(groups).toContain("usage: curated?.usage || item.usage");
    expect(groups).toContain("example: curated?.exampleJapanese || item.example");
    expect(groups).toContain("translation: curated?.exampleEnglish || item.translation");
  });

  it("still lets the model supply what the bank does not carry", () => {
    // The bank has no short meaning gloss, and a pattern it has never heard of
    // must not produce an empty card.
    expect(groups).toContain("meaning: item.meaning");
  });

  it("ships the bank to deployment", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("./Grammar/**/*.md");
    expect(CURATED_GRAMMAR_FILE).toBe("Grammar/jlpt_grammar_patterns_all_levels.md");
  });
});
