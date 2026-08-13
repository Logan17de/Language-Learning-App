import { describe, expect, it } from "vitest";
import { validateLessonScoreSubmission } from "@/lib/scoring-validation";

describe("score submission validation", () => {
  it("accepts the canonical 60/20/20 calculation", () => {
    expect(validateLessonScoreSubmission({
      score: 80, xp: 136, durationMinutes: 30,
      vocabularyCorrect: 4, vocabularyTotal: 5,
      grammarCorrect: 4, grammarTotal: 5,
      reviewCorrect: 4, reviewTotal: 5,
    })).toEqual([]);
  });

  it("rejects structurally inconsistent lesson metrics", () => {
    expect(validateLessonScoreSubmission({
      score: 100, xp: 900, durationMinutes: -1,
      vocabularyCorrect: 1, vocabularyTotal: 5,
      grammarCorrect: 1, grammarTotal: 5,
      reviewCorrect: 1, reviewTotal: 5,
    }).length).toBeGreaterThan(0);
  });
});
