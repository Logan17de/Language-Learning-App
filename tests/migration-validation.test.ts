import { describe, expect, it } from "vitest";
import { parseLegacyState } from "@/lib/migrations/migration-validation";

describe("legacy localStorage validation", () => {
  it("rejects malformed storage", () => {
    expect(parseLegacyState("not-json")).toBeNull();
    expect(parseLegacyState('{"version":4}')).toBeNull();
  });

  it("creates a bounded import preview and skips malformed records", () => {
    const preview = parseLegacyState(JSON.stringify({
      version: 4,
      state: {
        onboarding: { goal: "Conversation", dailyMinutes: 30, interests: ["travel"], completed: true },
        settings: { autoplay: false },
        progress: {
          recentLessons: [{ lessonId: "lesson_n4_commute_001", score: 88, durationMinutes: 22, completedAt: "2026-07-20T00:00:00Z" }, { bad: true }],
          weakKanji: [{ term: "駅", meaning: "station", mastery: 55 }],
          reviewQueue: [{ id: "one", type: "kanji", term: "駅", confidence: 55 }],
          achievements: [{ id: "first_lesson", progress: 1, earned: true }],
        },
        generatedLessons: [{ id: "generated_one", title: "Valid", phases: [] }, { id: "", title: "Bad" }],
      },
    }));
    expect(preview?.summary).toEqual({
      completedLessons: 1,
      masteryItems: 1,
      reviewItems: 1,
      achievements: 1,
      customLessons: 1,
      skippedRecords: 1,
    });
  });
});
