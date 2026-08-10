import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commuteLesson, mockLessons } from "@/data/mock-lessons";
import {
  CANONICAL_LESSON_ACTIVITY_COUNTS,
  CANONICAL_LESSON_PHASES,
  isCanonicalPlayableLesson,
  lessonContractIssues,
  normalizeLessonPhases,
} from "@/lib/lesson-contract";
import { phaseIsComplete } from "@/lib/lesson-phase-progress";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";

function sessionFor(lesson: LessonPackage): LessonSession {
  return {
    lessonId: lesson.id,
    currentPhaseIndex: 0,
    activityIndex: 0,
    elapsedSeconds: 0,
    startedAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
    completedPhaseIds: [],
    activities: {},
    storyInteractions: [],
    storyComplete: false,
    vocabularyAnswers: [],
    grammarAnswers: [],
    readingAnswers: [],
    readingEvents: [],
    readingComplete: false,
    listeningEvents: [],
    listeningComplete: false,
    speakingEvents: [],
    speakingComplete: false,
    reviewAnswers: [],
    reviewResult: null,
    completionResult: null,
    completed: false,
    rewarded: false,
  };
}

describe("canonical lesson contract", () => {
  it("uses one seven-phase learner order everywhere", () => {
    expect(CANONICAL_LESSON_PHASES.map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
      "review",
    ]);

    const oldStoredOrder = [
      { id: "story", label: "Story", description: "Story" },
      { id: "vocabulary", label: "Vocabulary", description: "Vocabulary" },
      { id: "grammar", label: "Grammar", description: "Grammar" },
      { id: "speaking", label: "Speaking", description: "Speaking" },
      { id: "reading", label: "Reading", description: "Reading" },
      { id: "listening", label: "Listening", description: "Listening" },
      { id: "review", label: "Review", description: "Review" },
    ];

    expect(normalizeLessonPhases(oldStoredOrder).map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
      "review",
    ]);
  });

  it("keeps every demo lesson on the same playable contract", () => {
    for (const lesson of mockLessons) {
      expect(lessonContractIssues(lesson), lesson.id).toEqual([]);
      expect(isCanonicalPlayableLesson(lesson), lesson.id).toBe(true);
    }
  });

  it("requires all 13 vocabulary answers before the learner can continue", () => {
    expect(commuteLesson.vocabularyQuestions).toHaveLength(
      CANONICAL_LESSON_ACTIVITY_COUNTS.vocabulary,
    );
    const session = sessionFor(commuteLesson);
    session.vocabularyAnswers = commuteLesson.vocabularyQuestions
      .slice(0, 10)
      .map((question) => ({
        questionId: question.id,
        mode: question.mode,
        selectedAnswer: question.correctAnswer,
        correct: true,
        attempts: 1,
      }));

    expect(phaseIsComplete(session, "vocabulary", commuteLesson)).toBe(false);

    session.vocabularyAnswers = commuteLesson.vocabularyQuestions.map(
      (question) => ({
        questionId: question.id,
        mode: question.mode,
        selectedAnswer: question.correctAnswer,
        correct: true,
        attempts: 1,
      }),
    );
    expect(phaseIsComplete(session, "vocabulary", commuteLesson)).toBe(true);
  });

  it("fails closed when a required canonical activity bank is incomplete", () => {
    const malformed: LessonPackage = {
      ...commuteLesson,
      vocabularyQuestions: commuteLesson.vocabularyQuestions.slice(0, 10),
    };
    expect(isCanonicalPlayableLesson(malformed)).toBe(false);
    expect(lessonContractIssues(malformed)).toContain(
      "Vocabulary practice must contain exactly 13 activities; found 10.",
    );
  });

  it("does not manufacture learner questions in the canonical mapper", () => {
    const mapper = readFileSync("lib/repositories/lesson-mapper.ts", "utf8");
    expect(mapper).not.toContain("Other answer");
    expect(mapper).not.toContain("fallbackVocabularyQuestions");
    expect(mapper).not.toContain("fallbackGrammarQuestions");
    expect(mapper).not.toContain("fallbackStoryWords");
    expect(mapper).toContain("normalizeLessonPhases");
  });

  it("locks generated schemas and storage to the same activity counts", () => {
    const vocabulary = readFileSync(
      "lib/gemini/vocabulary-question-contract.ts",
      "utf8",
    );
    const grammar = readFileSync(
      "lib/gemini/grammar-question-contract.ts",
      "utf8",
    );
    const reading = readFileSync(
      "lib/gemini/reading-comprehension-contract.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/20260808120000_canonical_lesson_contract.sql",
      "utf8",
    );

    expect(vocabulary).toContain("minItems: 13");
    expect(vocabulary).toContain("maxItems: 13");
    expect(grammar).toContain("minItems: 10");
    expect(grammar).toContain("maxItems: 10");
    expect(reading).toContain("minItems: 5");
    expect(reading).toContain("maxItems: 5");

    expect(migration).toContain(
      "jsonb_array_length(p_package->'vocabularyQuestions') <> 13",
    );
    expect(migration).toContain(
      "jsonb_array_length(p_package->'grammarQuestions') <> 10",
    );
    expect(migration).toContain(
      "jsonb_array_length(p_package->'readingQuestions') <> 5",
    );
    expect(migration).toContain(
      '"id":"reading","label":"Reading"',
    );
    expect(migration.indexOf('"id":"reading"')).toBeLessThan(
      migration.indexOf('"id":"speaking"'),
    );
  });
});
