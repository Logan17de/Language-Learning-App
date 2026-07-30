import { describe, expect, it } from "vitest";
import {
  composeEntryForm,
  lookupSurface,
  type LexiconEntry,
} from "@/lib/japanese-lexicon";
import { lexicalTermIssues } from "@/lib/gemini/story-lexicon-validation";
import type { DraftTerm } from "@/lib/gemini/lesson-engine-v2";

const now = "2026-07-30T00:00:00.000Z";

function verb(
  id: string,
  kanji: string,
  kana: string,
  conjugationType: LexiconEntry["conjugationType"],
): LexiconEntry {
  return {
    id,
    kanji,
    kana,
    meaning: id,
    partOfSpeech: "verb",
    conjugationType,
    aliases: [],
    source: "seed",
    createdAt: now,
    updatedAt: now,
  };
}

const eat = verb("eat", "食べる", "たべる", "ichidan");
const read = verb("read", "読む", "よむ", "godan-mu");

describe("AIko Japanese lexicon integration", () => {
  it("reconstructs supported inflected and contracted forms from one lemma", () => {
    expect(lookupSurface([eat], "食べました")[0]?.form.transformations).toEqual([
      "polite-past",
    ]);
    expect(lookupSurface([eat], "食べさせている")[0]?.form.transformations).toEqual([
      "causative",
      "te-iru",
    ]);
    expect(lookupSurface([eat], "食べたい")[0]?.form.transformations).toEqual([
      "desire",
    ]);
    expect(lookupSurface([eat], "食べちゃった")[0]?.form.transformations).toEqual([
      "te-shimau",
      "casual-contraction",
      "plain-past",
    ]);
    expect(lookupSurface([read], "読んじゃった")[0]?.form.transformations).toEqual([
      "te-shimau",
      "casual-contraction",
      "plain-past",
    ]);
    expect(lookupSurface([eat], "食べなきゃ")[0]?.form.transformations).toEqual([
      "negative-conditional",
      "casual-contraction",
    ]);
  });

  it("preserves potential and passive ambiguity", () => {
    const analyses = lookupSurface([eat], "食べられる").map(
      (candidate) => candidate.form.transformations,
    );
    expect(analyses).toContainEqual(["potential"]);
    expect(analyses).toContainEqual(["passive"]);
  });

  it("rejects unsupported deep chains instead of composing a partial form", () => {
    expect(
      composeEntryForm(eat, [
        "causative",
        "te-shimau",
        "casual-contraction",
        "plain-past",
      ]),
    ).toBeNull();
  });

  it("supports exact dictionary spelling aliases without storing derived rows", () => {
    const friend: LexiconEntry = {
      id: "friend",
      kanji: "友達",
      kana: "ともだち",
      meaning: "friend",
      partOfSpeech: "noun",
      aliases: ["友だち"],
      source: "seed",
      createdAt: now,
      updatedAt: now,
    };
    const candidate = lookupSurface([friend], "友だちだった")[0];
    expect(candidate?.matchedThroughAlias).toBe(true);
    expect(candidate?.form.transformations).toEqual(["plain-past"]);
    expect(friend.kanji).toBe("友達");
    expect(friend.aliases).toEqual(["友だち"]);
  });

  it("validates observed kana and blocks unrelated alias proofs", () => {
    const valid = {
      surface: "食べました",
      readingHint: "たべました",
      scriptType: "kanji",
      dictionaryForm: "食べる",
      dictionaryReading: "たべる",
      partOfSpeech: "verb",
      conjugationType: "ichidan",
      dictionaryAlias: "",
    } as unknown as DraftTerm;
    expect(lexicalTermIssues(valid, "term")).toEqual([]);

    const corrupted = {
      ...valid,
      dictionaryForm: "飲む",
      dictionaryReading: "のむ",
      dictionaryAlias: "食べる",
    } as unknown as DraftTerm;
    expect(lexicalTermIssues(corrupted, "term").length).toBeGreaterThan(0);
  });
});
