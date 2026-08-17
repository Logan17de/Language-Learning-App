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
      reading: "じん | にん | ひと",
      meaning: "person; human",
      studyLevel: "N5",
    });
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
