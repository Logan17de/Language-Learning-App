import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { commuteLesson } from "@/data/mock-lessons";
import { buildReviewActivities } from "@/lib/review-utils";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import { storyLengthRange } from "@/lib/story-support";
import { createEmptyLessonSession } from "@/store/app-store";
import type { LessonPackage } from "@/types/lesson";
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

  it("deduplicates hiragana and katakana through one normalized kana table", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260727092000_normalized_kana_library.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("create table public.kana_records");
    expect(migration).toContain("unique (normalized_value)");
    expect(migration).toContain("normalize(btrim(value), NFKC)");
    expect(migration).toContain("script_type in ('hiragana', 'katakana', 'mixed')");
    expect(migration).toContain("on conflict (normalized_value) do update");
    expect(migration).toContain("alter column kana_id set not null");
  });

  it("maps weak answers to the lesson library instead of demo terms", () => {
    const lesson: LessonPackage = {
      ...commuteLesson,
      kanji: commuteLesson.kanji.map((item, index) => ({
        ...item,
        libraryId: `kanji-${index}`,
      })),
      vocabulary: commuteLesson.vocabulary.map((item, index) => ({
        ...item,
        libraryId: `vocabulary-${index}`,
      })),
      grammar: commuteLesson.grammar.map((item, index) => ({
        ...item,
        libraryId: `grammar-${index}`,
      })),
      vocabularyQuestions: commuteLesson.vocabularyQuestions.map(
        (question, index) => ({
          ...question,
          targetItemIds: [`vocabulary-${index % commuteLesson.vocabulary.length}`],
        }),
      ),
      grammarQuestions: commuteLesson.grammarQuestions.map((question, index) => ({
        ...question,
        targetItemIds: [`grammar-${index % commuteLesson.grammar.length}`],
      })),
      reviewQuestions: commuteLesson.reviewQuestions.map((question) => ({
        ...question,
        targetItemIds: ["kanji-0"],
      })),
    };
    const session = createEmptyLessonSession(lesson.id);
    session.vocabularyAnswers = [{
      questionId: lesson.vocabularyQuestions[0].id,
      mode: lesson.vocabularyQuestions[0].mode,
      selectedAnswer: "wrong",
      correct: false,
      attempts: 1,
    }];
    session.grammarAnswers = [{
      questionId: lesson.grammarQuestions[0].id,
      type: lesson.grammarQuestions[0].type,
      selectedAnswer: "wrong",
      correct: false,
      skill: lesson.grammarQuestions[0].skill,
      attempts: 1,
    }];
    session.reviewAnswers = [{
      questionId: lesson.reviewQuestions[0].id,
      category: "kanji",
      selectedAnswer: "wrong",
      correct: false,
    }];

    expect(calculateLessonCompletion(lesson, session).wordsNeedingReview).toEqual([
      lesson.vocabulary[0].term,
      lesson.grammar[0].pattern,
      lesson.kanji[0].character,
    ]);
  });

  it("does not contain commute-specific player fallbacks", () => {
    const playerSources = [
      "components/lesson/reading-phase.tsx",
      "components/lesson/listening-phase.tsx",
      "components/lesson/speaking-phase.tsx",
      "components/exercises/speaking-feedback.tsx",
      "lib/scoring-utils.ts",
    ]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");

    expect(playerSources).not.toContain("Morning at the station");
    expect(playerSources).not.toContain("Yuki met Tanaka");
    expect(playerSources).not.toContain("Mock evaluation");
    expect(playerSources).not.toContain('wordsNeedingReview : ["改札"]');
  });
});
