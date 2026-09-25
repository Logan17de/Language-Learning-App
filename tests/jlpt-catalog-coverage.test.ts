import { readFileSync } from "node:fs";
import { parse } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { curatedGrammarPattern, loadCuratedGrammarCatalog } from "@/lib/curated-grammar-catalog";

/**
 * data/jlpt-catalog.json is the list of patterns and kanji the app is meant to
 * teach. Nothing enforced that the curated sources actually covered it, so a
 * pattern could sit in the catalog with no explanation behind it, or an
 * explanation could exist for a pattern the catalog never names — and either
 * would only show up as a thin lesson months later.
 *
 * These tests hold the three files to each other. They fail on the drift, not on
 * the symptom.
 */
const catalog = JSON.parse(readFileSync("data/jlpt-catalog.json", "utf8")) as {
  counts: { kanji: Record<string, number>; grammar: Record<string, number> };
  kanji: { level: string; position: number; character: string }[];
  grammar: { level: string; position: number; pattern: string }[];
};

function tally(items: { level: string }[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.level] = (counts[item.level] ?? 0) + 1;
    return counts;
  }, {});
}

describe("the JLPT catalog is internally consistent", () => {
  it("contains exactly what its own counts declare", () => {
    expect(tally(catalog.grammar)).toEqual(catalog.counts.grammar);
    expect(tally(catalog.kanji)).toEqual(catalog.counts.kanji);
    expect(catalog.grammar).toHaveLength(641);
    expect(catalog.kanji).toHaveLength(2136);
  });

  it("names each pattern and character once", () => {
    expect(new Set(catalog.grammar.map((item) => item.pattern)).size).toBe(641);
    expect(new Set(catalog.kanji.map((item) => item.character)).size).toBe(2136);
  });
});

describe("every catalog pattern is teachable", () => {
  it("has a curated entry behind it", () => {
    const missing = catalog.grammar.filter(
      (item) => !curatedGrammarPattern(item.pattern),
    );
    expect(missing).toEqual([]);
  });

  it("agrees with the bank on which level the pattern belongs to", () => {
    const misplaced = catalog.grammar.filter((item) => {
      const entry = curatedGrammarPattern(item.pattern);
      return entry !== null && entry.level !== item.level;
    });
    expect(misplaced).toEqual([]);
  });

  it("leaves no curated entry the catalog does not name", () => {
    const named = new Set(catalog.grammar.map((item) => item.pattern));
    const orphans = loadCuratedGrammarCatalog()
      .filter((entry) => !named.has(entry.pattern))
      .map((entry) => `${entry.id}:${entry.pattern}`);
    expect(orphans).toEqual([]);
  });

  it("resolves a pattern to itself, not to a lookalike", () => {
    // Dropping the placeholder mark merges patterns that are genuinely
    // different, so these four must each land on their own entry.
    expect(curatedGrammarPattern("しか～ない")?.level).toBe("N5");
    expect(curatedGrammarPattern("しかない")?.level).toBe("N4");
    expect(curatedGrammarPattern("つ～つ")?.level).toBe("N1");
    expect(curatedGrammarPattern("つつ")?.level).toBe("N2");
  });
});

describe("every catalog kanji is teachable", () => {
  const rows = readFileSync(
    "Vocabs/jlpt_all_kanji_with_kana_readings.csv",
    "utf8",
  )
    .replace(/^﻿/u, "")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => line.split(","));
  const header = rows[0].map((value) => value.trim());
  const character = header.indexOf("kanji");
  const level = header.indexOf("introduced_level");

  const curated = new Map(
    rows.slice(1).map((row) => [row[character]?.normalize("NFKC").trim(), row[level]?.trim()]),
  );

  it("appears in the curated kanji catalog at the same level", () => {
    const wrong = catalog.kanji.filter((item) => {
      const found = curated.get(item.character.normalize("NFKC"));
      return found === undefined || found !== item.level;
    });
    expect(wrong).toEqual([]);
  });

  it("leaves no curated kanji the catalog does not name", () => {
    const named = new Set(catalog.kanji.map((item) => item.character.normalize("NFKC")));
    const orphans = [...curated.keys()].filter((value) => value && !named.has(value));
    expect(orphans).toEqual([]);
  });

  it("reads the catalog the app actually ships", () => {
    expect(parse("data/jlpt-catalog.json").base).toBe("jlpt-catalog.json");
  });
});
