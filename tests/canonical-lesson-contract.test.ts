import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commuteLesson } from "@/data/mock-lessons";
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
    completionResult: null,
    completed: false,
    rewarded: false,
  };
}

describe("canonical lesson contract", () => {
  it("runs six learner sections, with Grammar no longer split", () => {
    expect(CANONICAL_LESSON_PHASES.map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
    ]);

    const incompleteStoredOrder = [
      { id: "story", label: "Story", description: "Story" },
      { id: "grammar", label: "Grammar", description: "Grammar" },
      { id: "speaking", label: "Speaking", description: "Speaking" },
      { id: "unknown", label: "Unknown", description: "Unknown" },
    ];
    expect(normalizeLessonPhases(incompleteStoredOrder).map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
    ]);
  });

  it("keeps seed lessons playable under the current generated format", () => {
    expect(lessonContractIssues(commuteLesson)).toEqual([]);
    expect(isCanonicalPlayableLesson(commuteLesson)).toBe(true);
  });

  it("uses 7 Grammar activities and no separate Translation count", () => {
    expect(CANONICAL_LESSON_ACTIVITY_COUNTS).toEqual({
      vocabulary: 7,
      grammar: 7,
      reading: 5,
      listening: 5,
      speaking: 5,
    });
  });

  it("completes a stored vocabulary phase only after all stored questions are answered", () => {
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

    session.vocabularyAnswers = commuteLesson.vocabularyQuestions.map((question) => ({
      questionId: question.id,
      mode: question.mode,
      selectedAnswer: question.correctAnswer,
      correct: true,
      attempts: 1,
    }));
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

  it("locks generation and DB validation to the current shape", () => {
    const vocabulary = readFileSync("lib/gemini/vocabulary-question-contract.ts", "utf8");
    const grammar = readFileSync("lib/gemini/grammar-question-contract.ts", "utf8");
    const reading = readFileSync("lib/gemini/reading-comprehension-contract.ts", "utf8");
    const listening = readFileSync("lib/gemini/listening-question-contract.ts", "utf8");
    const speaking = readFileSync("lib/gemini/speaking-question-contract.ts", "utf8");
    const migration = readFileSync(
      "supabase/migrations/20260813070000_reading_mcq_choices.sql",
      "utf8",
    );
    const curatedMigration = readFileSync(
      "supabase/migrations/20260813080000_curated_jlpt_vocabulary.sql",
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
    expect(migration).toContain("add column if not exists choices text[]");
    expect(curatedMigration).toContain("vocabulary must be an array");
  });
});
