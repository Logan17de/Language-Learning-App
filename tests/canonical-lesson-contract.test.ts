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
  it("uses the six-phase learner order with no final review", () => {
    expect(CANONICAL_LESSON_PHASES.map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
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
    ]);
  });

  it("keeps existing curated demo lessons playable without preserving old generation logic", () => {
    for (const lesson of mockLessons) {
      expect(lessonContractIssues(lesson), lesson.id).toEqual([]);
      expect(isCanonicalPlayableLesson(lesson), lesson.id).toBe(true);
    }
  });

  it("uses 7-7-5-5-5 for generated practice and no review bank", () => {
    expect(CANONICAL_LESSON_ACTIVITY_COUNTS).toEqual({
      vocabulary: 7,
      grammar: 7,
      reading: 5,
      listening: 5,
      speaking: 5,
      review: 0,
    });
  });

  it("completes a stored vocabulary phase only after all of its questions are answered", () => {
    const session = sessionFor(commuteLesson);
    session.vocabularyAnswers = commuteLesson.vocabularyQuestions
      .slice(0, commuteLesson.vocabularyQuestions.length - 1)
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

  it("does not manufacture learner questions in the canonical mapper", () => {
    const mapper = readFileSync("lib/repositories/lesson-mapper.ts", "utf8");
    expect(mapper).not.toContain("Other answer");
    expect(mapper).not.toContain("fallbackVocabularyQuestions");
    expect(mapper).not.toContain("fallbackGrammarQuestions");
    expect(mapper).not.toContain("fallbackStoryWords");
    expect(mapper).toContain("normalizeLessonPhases");
  });

  it("locks generation and the unpushed DB migration to the current shape", () => {
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
    const listening = readFileSync(
      "lib/gemini/listening-question-contract.ts",
      "utf8",
    );
    const speaking = readFileSync(
      "lib/gemini/speaking-question-contract.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/20260813070000_reading_mcq_choices.sql",
      "utf8",
    );

    expect(vocabulary).toContain("minItems: 7");
    expect(vocabulary).toContain("maxItems: 7");
    expect(grammar).toContain("minItems: 7");
    expect(grammar).toContain("maxItems: 7");
    expect(reading).toContain("minItems: 5");
    expect(reading).toContain("maxItems: 5");
    expect(listening).toContain("minItems: 5");
    expect(listening).toContain("maxItems: 5");
    expect(speaking).toContain("minItems: 5");
    expect(speaking).toContain("maxItems: 5");
    expect(migration).toContain("reviewQuestions must be empty");
    expect(migration).toContain("add column if not exists choices text[]");
    expect(migration).toContain("Reading MCQ at position % requires exactly four choices");
  });
});
