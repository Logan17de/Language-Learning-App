import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/audio/transcribe/route.ts", "utf8");
const phase = readFileSync("components/lesson/speaking-phase.tsx", "utf8");

describe("a wrong answer scores nothing", () => {
  it("reports a score inside the noise band as zero", () => {
    // Romaji comparison has a high floor: the alphabet is small and Japanese
    // repeats its vowels, so unrelated speech still overlaps. Measured against
    // a real sentence, nonsense scores 12, English 11, an unrelated Japanese
    // sentence 13 — while reading half the sentence scores 46.
    expect(route).toContain("const SCORE_NOISE_FLOOR = 25");
    expect(route).toContain("function reportableScore");
    expect(route).toContain("score < SCORE_NOISE_FLOOR ? 0 : score");
  });

  it("applies it to the score the learner is shown and graded on", () => {
    expect(route).toContain(
      "const score = reportableScore(Math.max(writtenScore, romajiScore))",
    );
    // The pass threshold is untouched.
    expect(route).toContain("correct: score >= 70");
  });

  it("keeps both legs recorded for evidence", () => {
    expect(route).toContain("writtenScore,");
    expect(route).toContain("romajiScore,");
  });
});

describe("the reading is ready before it is asked for", () => {
  it("fetches it when the sentence appears, not on the click", () => {
    expect(phase).toContain("async function fetchReading()");
    expect(phase).toContain("}, [exercise.id]);");
    expect(phase).toContain("void fetchReading()");
  });

  it("reveals what is already loaded instead of refetching", () => {
    expect(phase).toContain("setReadingRevealed(true)");
    expect(phase).toContain("readingRevealed && readingHint?.exerciseId === exercise.id");
  });

  it("hides the previous sentence's reading when the sentence changes", () => {
    expect(phase).toContain("setReadingRevealed(false)");
  });

  it("does not interrupt the learner when a prefetch fails", () => {
    const fetcher = phase.slice(phase.indexOf("async function fetchReading()"));
    expect(fetcher.slice(0, 900)).not.toContain("setError(");
  });
});

describe("the screen does not explain its own mechanics", () => {
  it("drops the seconds-and-threshold line", () => {
    expect(phase).not.toContain("You have up to");
    expect(phase).not.toContain("moves you forward");
    expect(phase).not.toContain("70% match");
  });
});
