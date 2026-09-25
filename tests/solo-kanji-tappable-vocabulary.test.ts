import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  loadCuratedVocabularyCatalog,
  matchCuratedStoryVocabulary,
  SOLO_KANJI_CATALOG_FILE,
} from "@/lib/curated-vocabulary-catalog";

describe("solo kanji tappable vocabulary", () => {
  it("loads every solo JLPT kanji with its curated readings", () => {
    const soloKanji = loadCuratedVocabularyCatalog().filter(
      (entry) => entry.sourceFile === SOLO_KANJI_CATALOG_FILE,
    );

    expect(soloKanji).toHaveLength(2136);
    expect(soloKanji.every((entry) => Array.from(entry.word).length === 1)).toBe(true);

    const person = soloKanji.find((entry) => entry.id === "N5_K001");
    expect(person).toMatchObject({
      word: "人",
      // The catalog lists all three readings in one pipe-separated field. They
      // are separate readings, not one reading spelled with pipes and spaces.
      reading: "じん",
      readings: ["じん", "にん", "ひと"],
      meaning: "person; human",
      studyLevel: "N5",
    });
  });

  it("never produces a reading the database would refuse to store", () => {
    // vocabulary_records links each reading to a kana_records row and rejects
    // anything that is not one unbroken run of kana. Storing the raw
    // pipe-separated field broke vocabulary enrichment for every story
    // containing a multi-reading kanji, which is most of the catalog.
    const KANA_ONLY = /^[ぁ-ゖゝゞァ-ヺヽヾー]+$/u;
    const catalog = loadCuratedVocabularyCatalog();
    const unstorable = catalog.filter((entry) => !KANA_ONLY.test(entry.reading));

    expect(unstorable).toEqual([]);
    expect(
      catalog.every((entry) => entry.readings.every((r) => KANA_ONLY.test(r))),
    ).toBe(true);
    // The split is real: most curated kanji carry more than one reading.
    expect(catalog.filter((entry) => entry.readings.length > 1).length).toBeGreaterThan(1000);
  });

  it("makes a standalone kanji tappable when no longer curated word occupies it", () => {
    const matches = matchCuratedStoryVocabulary("人が来た。今日は雨です。");

    expect(matches.some((entry) => entry.word === "人")).toBe(true);
    expect(matches.some((entry) => entry.word === "雨")).toBe(true);
  });

  it("keeps a curated compound ahead of its individual kanji", () => {
    const matches = matchCuratedStoryVocabulary("日本人です。");

    expect(matches[0]).toMatchObject({
      id: "N5_V002",
      word: "日本人",
      reading: "にほんじん",
      meaning: "Japanese person",
    });
    expect(matches.some((entry) => ["日", "本", "人"].includes(entry.word))).toBe(false);
  });
});
