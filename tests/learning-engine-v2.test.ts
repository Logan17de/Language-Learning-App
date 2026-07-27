import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commuteLesson } from "@/data/mock-lessons";
import { buildReviewActivities } from "@/lib/review-utils";
import { storyLengthRange } from "@/lib/story-support";
import type { ReviewQueueItem } from "@/types/progress";

function queueItem(
  id: string,
  confidence: number,
  overrides: Partial<ReviewQueueItem> = {},
): ReviewQueueItem {
  return {
    id,
    type: "vocabulary",
    term: id,
    reading: `${id}-reading`,
    meaning: `${id}-meaning`,
    dueLabel: "Due now",
    confidence,
    ...overrides,
  };
}

describe("learning engine V2 contracts", () => {
  it("grows story length from 10–12 lines at N5 to 18–20 at N1", () => {
    expect(storyLengthRange("N5")).toEqual({ min: 10, max: 12 });
    expect(storyLengthRange("N3")).toEqual({ min: 14, max: 16 });
    expect(storyLengthRange("N1")).toEqual({ min: 18, max: 20 });
  });

  it("keeps seed lessons compatible with the stored ten-question phases", () => {
    expect(commuteLesson.vocabularyQuestions).toHaveLength(10);
    expect(commuteLesson.grammarQuestions).toHaveLength(10);
    expect(
      commuteLesson.vocabularyQuestions.every(
        (question) => question.choices.includes(question.correctAnswer),
      ),
    ).toBe(true);
    expect(
      commuteLesson.grammarQuestions.every(
        (question) => question.choices.includes(question.correctAnswer),
      ),
    ).toBe(true);
  });

  it("builds review only from real weak items and never invents fallbacks", () => {
    const activities = buildReviewActivities([
      queueItem("mastered", 92),
      queueItem("weak", 40),
      queueItem("overdue", 60, { overdue: true, type: "kanji" }),
    ]);

    expect(activities).toHaveLength(2);
    expect(activities.map((activity) => activity.queueItemId)).toEqual([
      "overdue",
      "weak",
    ]);
    expect(buildReviewActivities([])).toEqual([]);
    expect(buildReviewActivities([queueItem("mastered", 100)])).toEqual([]);
  });

  it("keeps level completion tied to finite JLPT catalogs", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727090000_learning_engine_v2.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("from public.kanji_catalog catalog");
    expect(migration).toContain("from public.grammar_catalog catalog");
    expect(migration).not.toContain("v_total_lessons");
    expect(migration).not.toMatch(/\bdrop\s+(table|schema|database)\b/i);
  });
});
