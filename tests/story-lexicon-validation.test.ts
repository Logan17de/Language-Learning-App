import { describe, expect, it } from "vitest";
import {
  lexicalTermIssues,
  type LexicalDraftTerm,
} from "@/lib/gemini/story-lexicon-validation";

function term(overrides: Partial<LexicalDraftTerm> = {}): LexicalDraftTerm {
  return {
    surface: "食べました",
    readingHint: "たべる",
    scriptType: "kanji",
    dictionaryForm: "食べる",
    dictionaryReading: "たべる",
    partOfSpeech: "verb",
    conjugationType: "ichidan",
    dictionaryAlias: "",
    ...overrides,
  };
}

describe("story lexical validation", () => {
  it("repairs an observed reading deterministically when the written form recomposes exactly", () => {
    const candidate = term();

    expect(lexicalTermIssues(candidate, "Line 1, term 1")).toEqual([]);
    expect(candidate.readingHint).toBe("たべました");
  });

  it("does not repair an unrelated canonical lemma and reports actionable morphology details", () => {
    const candidate = term({
      dictionaryForm: "飲む",
      dictionaryReading: "のむ",
      conjugationType: "godan-mu",
    });

    const issues = lexicalTermIssues(candidate, "Line 1, term 1");

    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("written surface cannot be recomposed");
    expect(issues[0]).toContain('"surface":"食べました"');
    expect(issues[0]).toContain('"dictionaryForm":"飲む"');
    expect(candidate.readingHint).toBe("たべる");
  });
});
