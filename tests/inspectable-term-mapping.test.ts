import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveTermsInText } from "@/lib/gemini/inspectable-term-mapping";

type Row = Parameters<typeof resolveTermsInText>[1] extends Map<string, infer R>
  ? R extends Array<infer Item>
    ? Item
    : never
  : never;

function row(id: string, written: string, reading: string, meaning: string): Row {
  return {
    id,
    written_form: written,
    dictionary_form: written,
    aliases: [],
    reading,
    meaning,
  } as unknown as Row;
}

function index(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const item of rows) {
    const key = (item as unknown as { written_form: string }).written_form;
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}

describe("resolving the words a learner can tap", () => {
  it("finds a word that stands on its own", () => {
    const terms = resolveTermsInText(
      "私は学生です。",
      index([row("v1", "学生", "がくせい", "student")]),
    );
    expect(terms).toHaveLength(1);
    expect(terms[0]).toMatchObject({
      libraryId: "v1",
      libraryType: "vocabulary",
      surface: "学生",
      reading: "がくせい",
      meaning: "student",
      scriptType: "kanji",
    });
  });

  it("reaches a kanji the segmenter keeps glued to its okurigana", () => {
    // 考える comes back as one piece, so 考 is only reachable by looking inside
    // it. This is the same gap that left single kanji untappable in the story.
    const terms = resolveTermsInText(
      "彼は考えました。",
      index([row("k1", "考", "かんが", "think")]),
    );
    expect(terms.map((term) => term.surface)).toContain("考");
  });

  it("prefers the compound over the characters inside it", () => {
    const terms = resolveTermsInText(
      "日本人です。",
      index([
        row("c1", "日本人", "にほんじん", "Japanese person"),
        row("k1", "日", "ひ", "day"),
        row("k2", "人", "ひと", "person"),
      ]),
    );
    expect(terms.map((term) => term.surface)).toEqual(["日本人"]);
  });

  it("offers a repeated word once", () => {
    const terms = resolveTermsInText(
      "水と水。",
      index([row("v1", "水", "みず", "water")]),
    );
    expect(terms).toHaveLength(1);
  });

  it("refuses an ambiguous surface rather than guessing", () => {
    // Two library rows answer to the same written form, so a tap could teach
    // the wrong one.
    const ambiguous = new Map([
      ["雨", [row("a1", "雨", "あめ", "rain"), row("a2", "雨", "あま", "rain")]],
    ]);
    expect(resolveTermsInText("雨がふる。", ambiguous)).toEqual([]);
  });

  it("marks the script so the reading is revealed for kanji only", () => {
    const terms = resolveTermsInText(
      "コーヒーをのむ。",
      index([row("v1", "コーヒー", "こーひー", "coffee")]),
    );
    expect(terms[0]?.scriptType).toBe("katakana");
  });

  it("finds nothing in text with no Japanese", () => {
    expect(resolveTermsInText("Choose the best answer.", index([]))).toEqual([]);
  });
});

describe("mapping runs with audio and cannot fail the lesson", () => {
  const runner = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
  const mapping = readFileSync("lib/gemini/inspectable-term-mapping.ts", "utf8");

  it("runs in the audio stage, once the Japanese is final", () => {
    const stage = runner.slice(runner.indexOf("async function processAudio"));
    expect(stage).toContain("mapStoredLessonTerms(job.lesson_version_id, admin)");
    expect(stage.indexOf("mapStoredLessonTerms")).toBeLessThan(
      stage.indexOf("prepareStoredLessonAudio"),
    );
  });

  it("steps over its own failure", () => {
    // A lesson is playable with untapped words; it is not playable if the audio
    // stage dies.
    const stage = runner.slice(runner.indexOf("async function processAudio"));
    expect(stage).toContain("Custom lesson tappable terms could not be mapped.");
  });

  it("leaves rows that already carry terms alone", () => {
    expect(mapping).toContain("empty(row.inspectable_terms)");
  });

  it("takes terms only from the curated library", () => {
    expect(mapping).toContain('CURATED_SOURCE_MODEL = "jlpt-curated-csv"');
    expect(mapping).toContain('.eq("source_model", CURATED_SOURCE_MODEL)');
  });
});
