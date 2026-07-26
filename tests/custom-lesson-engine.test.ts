import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync("components/custom-topic/custom-topic-page.tsx", "utf8");
const route = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const targets = readFileSync("lib/gemini/lesson-targets.ts", "utf8");
const generation = readFileSync("lib/gemini/lesson-generation.ts", "utf8");

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

  it("enriches only missing library categories before selecting targets", () => {
    expect(targets).toContain("libraryNeedsEnrichment");
    expect(targets).toContain("generateLessonLibrarySeed");
    expect(targets).toContain("enrich_custom_lesson_library");
    expect(targets).toContain("rankedKanji.length < 5 ? seed.kanji : []");
    expect(targets).toContain("rankedGrammar.length < 3 ? seed.grammar : []");
    expect(targets).toContain("vocabularyRows.length < 20 ? seed.vocabulary : []");
    expect(generation).toContain("Every meaningful Japanese content word or kanji");
  });
});
