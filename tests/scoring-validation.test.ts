import { describe, expect, it } from "vitest";
import { validateLessonScoreSubmission } from "@/lib/scoring-validation";

describe("score submission validation", () => {
  it("accepts the canonical six-phase calculation", () => {
    expect(validateLessonScoreSubmission({
      score: 80,
      xp: 136,
      durationMinutes: 30,
      storyScore: 80,
      vocabularyCorrect: 4,
      vocabularyTotal: 5,
      grammarCorrect: 4,
      grammarTotal: 5,
      readingCorrect: 4,
      readingTotal: 5,
      listeningCorrect: 4,
      listeningTotal: 5,
      speakingScore: 80,
    })).toEqual([]);
  });

  it("rejects structurally inconsistent lesson metrics", () => {
    expect(validateLessonScoreSubmission({
      score: 100,
      xp: 900,
      durationMinutes: -1,
      storyScore: 120,
      vocabularyCorrect: 1,
      vocabularyTotal: 5,
      grammarCorrect: 1,
      grammarTotal: 5,
      readingCorrect: 6,
      readingTotal: 5,
      listeningCorrect: 1,
      listeningTotal: 5,
      speakingScore: -1,
    }).length).toBeGreaterThan(0);
  });
});
