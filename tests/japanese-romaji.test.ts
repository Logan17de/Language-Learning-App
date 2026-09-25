import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  japaneseToRomaji,
  textSimilarity,
} from "@/lib/japanese-romaji";

describe("romaji speaking evaluation", () => {
  it(
    "normalizes kanji and kana readings to the same romaji",
    async () => {
      const kanji = await japaneseToRomaji("国の畑に水がありませんでした。");
      const kana = await japaneseToRomaji("くにのはたけにみずがありませんでした。");
      expect(kanji).toBe(kana);
      expect(textSimilarity(kanji, kana)).toBe(100);
    },
    15_000,
  );

  it("uses the seventy-percent threshold as a pass boundary", () => {
    expect(textSimilarity("kuni no hatake ni mizu", "kuni no hatake ni mizu")).toBe(100);
    expect(textSimilarity("kuni no hatake ni", "kuni no hatake ni mizu")).toBeGreaterThanOrEqual(70);
  });
});
