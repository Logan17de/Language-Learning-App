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

  it("keeps every existing demo lesson playable during the seven-question transition", () => {
    for (const lesson of mockLessons) {
      expect(lessonContractIssues(lesson), lesson.id).toEqual([]);
      expect(isCanonicalPlayableLesson(lesson), lesson.id).toBe(true);
    }
  });

  it("uses seven activities for every newly generated learner phase except the five-item final review", () => {
    expect(CANONICAL_LESSON_ACTIVITY_COUNTS).toEqual({
      vocabulary: 7,
      grammar: 7,
      reading: 7,
      listening: 7,
      speaking: 7,
      review: 5,
    });
  });

  it("still completes a legacy vocabulary phase only after all of its stored questions are answered", () => {
    expect(commuteLesson.vocabularyQuestions).toHaveLength(13);
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

  it("fails closed when an activity bank matches neither current nor legacy counts", () => {
    const malformed: LessonPackage = {
      ...commuteLesson,
      vocabularyQuestions: commuteLesson.vocabularyQuestions.slice(0, 10),
    };
    expect(isCanonicalPlayableLesson(malformed)).toBe(false);
    expect(lessonContractIssues(malformed).join(" ")).toContain(
      "Vocabulary practice must contain 7 current-format or 13 legacy activities; found 10.",
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

  it("locks new generated schemas to seven activities while storage remains backward compatible", () => {
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
    const flexibleStorage = readFileSync(
      "supabase/migrations/20260805090000_flexible_generated_lesson_validation.sql",
      "utf8",
    );
    const readingMcq = readFileSync(
      "supabase/migrations/20260813070000_reading_mcq_choices.sql",
      "utf8",
    );

    expect(vocabulary).toContain("minItems: 7");
    expect(vocabulary).toContain("maxItems: 7");
    expect(grammar).toContain("minItems: 7");
    expect(grammar).toContain("maxItems: 7");
    expect(reading).toContain("minItems: 7");
    expect(reading).toContain("maxItems: 7");
    expect(flexibleStorage).toContain("Accepts variable generated lesson counts");
    expect(readingMcq).toContain("add column if not exists choices text[]");
    expect(readingMcq).toContain("Reading MCQ at position % requires exactly four choices");
  });
});
