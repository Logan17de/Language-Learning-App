import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync("components/custom-topic/custom-topic-page.tsx", "utf8");
const route = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const targets = readFileSync("lib/gemini/lesson-targets.ts", "utf8");
const generation = readFileSync("lib/gemini/lesson-generation.ts", "utf8");
const quota = readFileSync(
  "supabase/migrations/20260727003000_failed_custom_lessons_do_not_consume_quota.sql",
  "utf8",
);
const catalog = JSON.parse(readFileSync("data/jlpt-catalog.json", "utf8")) as {
  counts: {
    kanji: Record<string, number>;
    grammar: Record<string, number>;
  };
  kanji: unknown[];
  grammar: unknown[];
};

describe("custom lesson engine contract", () => {
  it("asks the learner for only topic and level", () => {
    expect(form).toContain('<Field label="Topic">');
    expect(form).toContain('<Field label="Level">');
    expect(form).not.toContain('<Field label="Lesson length">');
    expect(form).not.toContain('<Field label="Preferred focus">');
    expect(form).not.toContain('<Field label="Speaking difficulty">');
    expect(form).not.toContain('<Field label="Optional note">');
    expect(form).toContain("JSON.stringify({ topic, level })");
    expect(route).toContain("const durationMinutes = 30");
    expect(route).toContain('tone: "encouraging"');
  });

  it("shows an unmistakable, accessible generation state", () => {
    expect(form).toContain('role="status"');
    expect(form).toContain("Our AI is creating a lesson for you.");
    expect(form).toContain("Selecting 5 kanji and 3 grammar targets");
    expect(form).toContain("Writing your story and practice activities");
    expect(form).toContain("Checking answers and saving your lesson");
    expect(form).toContain("AbortSignal.timeout(300_000)");
  });

  it("enriches only missing library categories before selecting targets", () => {
    expect(targets).toContain("libraryNeedsEnrichment");
    expect(targets).toContain("generateLessonLibrarySeed");
    expect(targets).toContain("enrich_custom_lesson_library");
    expect(targets).toContain("selectedKanjiNeedDetails ? seed.kanji : []");
    expect(targets).toContain("selectedGrammarNeedDetails ? seed.grammar : []");
    expect(targets).toContain("vocabularyRows.length < 20 ? seed.vocabulary : []");
    expect(targets).toContain('.from("kanji_catalog")');
    expect(targets).toContain('.from("grammar_catalog")');
    expect(generation).toContain("Required kanji (exact)");
    expect(generation).toContain("Required grammar patterns (exact)");
    expect(generation).toContain("Every meaningful Japanese content word or kanji");
  });

  it("normalizes the complete user-provided JLPT catalogs", () => {
    expect(catalog.kanji).toHaveLength(2136);
    expect(catalog.grammar).toHaveLength(641);
    expect(catalog.counts.kanji).toEqual({ N5: 80, N4: 170, N3: 370, N2: 380, N1: 1136 });
    expect(catalog.counts.grammar).toEqual({ N5: 82, N4: 112, N3: 136, N2: 124, N1: 187 });
  });

  it("does not charge failed generation attempts against the daily allowance", () => {
    expect(quota).toContain("and status <> 'failed'");
    expect(quota).toContain("Daily custom lesson limit reached");
  });
});
