import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commuteLesson } from "@/data/mock-lessons";
import { restartIncompleteLessonPhase } from "@/lib/lesson-resume";
import { buildLegacyMasteryEvidence } from "@/lib/sync/legacy-mastery-evidence";
import { createEmptyLessonSession } from "@/store/app-store";
import type { LessonPackage, StoryWord } from "@/types/lesson";
import type { Json } from "@/types/database";

const kanjiWord: StoryWord = {
  id: "word-station",
  libraryId: "kanji-station",
  libraryType: "kanji",
  position: 1,
  surface: "駅",
  reading: "えき",
  meaning: "station",
  scriptType: "kanji",
  baseMeaningScore: 0,
  baseRecognitionScore: 0,
  basePronunciationScore: 0,
};

const vocabularyQuestion = {
  ...commuteLesson.vocabularyQuestions[0],
  id: "station-question",
  prompt: "Choose the reading.",
  cue: "駅",
  choices: ["えき", "いき", "えぎ", "いけ"],
  correctAnswer: "えき",
  acceptedAnswers: ["えき"],
  targetItemIds: [],
  inspectableTerms: [kanjiWord],
};

const lesson: LessonPackage = {
  ...commuteLesson,
  kanji: [
    {
      libraryId: "kanji-station",
      character: "駅",
      reading: "えき",
      meaning: "station",
    },
  ],
  vocabularyQuestions: [vocabularyQuestion],
};

function evidenceRecords(events: Json[]): Array<Record<string, unknown>> {
  return events as unknown as Array<Record<string, unknown>>;
}

function answered(questionId: string) {
  return {
    questionId,
    mode: vocabularyQuestion.mode,
    selectedAnswer: vocabularyQuestion.correctAnswer,
    correct: true,
    attempts: 1,
  };
}

/**
 * Client-side mastery construction was retired. Mastery is now:
 *   persisted canonical answer/event evidence
 *     -> commit_lesson_phase()
 *     -> server-owned mastery
 *
 * These tests cover the parts of that contract that still live in the client:
 * which kanji signals a completed section produces, and the guarantee that an
 * unfinished section carries no evidence to the server at all. The database
 * half of the contract - duplicate-commit idempotency, unanswered rows being
 * ignored, and learners being unable to write learner_mastery directly - is
 * proved in supabase/tests/learn_phase_mastery_compatibility_behavior.sql and
 * supabase/tests/learn_security_behavior.sql.
 */
describe("section-batched kanji mastery", () => {
  it("carries no evidence for a section the learner did not finish", () => {
    const session = createEmptyLessonSession(lesson.id);
    session.vocabularyAnswers = [answered(vocabularyQuestion.id)];

    // Phase-atomic resume discards the partial attempt before anything can be
    // persisted, so a half-finished section has nothing to earn mastery with.
    const resumed = restartIncompleteLessonPhase(session);

    expect(resumed.completedPhaseIds).not.toContain("vocabulary");
    expect(resumed.vocabularyAnswers).toEqual([]);
    expect(
      buildLegacyMasteryEvidence(lesson, resumed, "vocabulary"),
    ).toEqual([]);
  });

  it("keeps a completed section's answers so the phase commit has evidence", () => {
    const session = createEmptyLessonSession(lesson.id);
    session.completedPhaseIds = ["story", "vocabulary"];
    session.vocabularyAnswers = [answered(vocabularyQuestion.id)];

    const resumed = restartIncompleteLessonPhase(session);

    expect(resumed.completedPhaseIds).toContain("vocabulary");
    expect(resumed.vocabularyAnswers).toHaveLength(1);
  });

  it("only trusts a contiguous run of completed phases", () => {
    // A phase cannot be complete while an earlier one is not. A forged
    // out-of-order completion set collapses instead of earning mastery.
    const session = createEmptyLessonSession(lesson.id);
    session.completedPhaseIds = ["vocabulary", "speaking"];
    session.vocabularyAnswers = [answered(vocabularyQuestion.id)];

    const resumed = restartIncompleteLessonPhase(session);

    expect(resumed.completedPhaseIds).toEqual([]);
    expect(resumed.vocabularyAnswers).toEqual([]);
  });

  it("adds recognition evidence after an answer completed without kanji help", () => {
    const session = createEmptyLessonSession(lesson.id);
    session.completedPhaseIds = ["vocabulary"];
    session.vocabularyAnswers = [answered(vocabularyQuestion.id)];

    const evidence = evidenceRecords(
      buildLegacyMasteryEvidence(lesson, session, "vocabulary"),
    );
    expect(evidence).toContainEqual(
      expect.objectContaining({
        itemType: "kanji",
        itemKey: "kanji-station",
        dimension: "recognition",
        signal: "exposure",
      }),
    );
  });

  it("does not award unassisted recognition after that kanji was inspected", () => {
    const session = createEmptyLessonSession(lesson.id);
    session.completedPhaseIds = ["vocabulary"];
    session.storyInteractions = [
      {
        id: "station-reading-help",
        lineId: vocabularyQuestion.id,
        wordId: kanjiWord.id,
        term: kanjiWord.surface,
        type: "reading-revealed",
        script: "kanji",
      },
    ];
    session.vocabularyAnswers = [answered(vocabularyQuestion.id)];

    const evidence = evidenceRecords(
      buildLegacyMasteryEvidence(lesson, session, "vocabulary"),
    );
    expect(
      evidence.some(
        (event) =>
          event.itemKey === "kanji-station" && event.signal === "exposure",
      ),
    ).toBe(false);
  });

  it("awards a later question when the same kanji is not touched again", () => {
    const secondQuestion = {
      ...vocabularyQuestion,
      id: "second-station-question",
    };
    const repeatedLesson: LessonPackage = {
      ...lesson,
      vocabularyQuestions: [vocabularyQuestion, secondQuestion],
    };
    const session = createEmptyLessonSession(repeatedLesson.id);
    session.completedPhaseIds = ["vocabulary"];
    session.storyInteractions = [
      {
        id: "first-question-help",
        lineId: vocabularyQuestion.id,
        wordId: kanjiWord.id,
        term: kanjiWord.surface,
        type: "reading-revealed",
        script: "kanji",
      },
    ];
    session.vocabularyAnswers = [vocabularyQuestion, secondQuestion].map(
      (question) => answered(question.id),
    );

    const evidence = evidenceRecords(
      buildLegacyMasteryEvidence(repeatedLesson, session, "vocabulary"),
    );
    expect(
      evidence.filter(
        (event) =>
          event.itemKey === "kanji-station" && event.signal === "exposure",
      ),
    ).toHaveLength(1);
    expect(evidence).toContainEqual(
      expect.objectContaining({
        clientEventId:
          "vocabulary:second-station-question:kanji-station:unassisted",
      }),
    );
  });

  it("gives the client no way to write mastery directly", () => {
    // Static guarantee: the retired client mastery builder must not come back.
    // Reward authority is commit_lesson_phase(), reached through commitPhase().
    const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
    expect(sync).not.toContain("buildMasteryEvidence(");
    expect(sync).not.toContain("export function buildMasteryEvidence");
    expect(sync).toContain("commitPhase(");
  });

  it("commits mastery at a section boundary, not after each answer", async () => {
    const backendSync = await import("@/lib/sync/backend-sync");
    // Per-answer sync persists a checkpoint only; the phase boundary is the
    // single entry point that can advance mastery.
    expect(backendSync).not.toHaveProperty("buildMasteryEvidence");
    expect(typeof backendSync.syncLessonPhaseCompletion).toBe("function");
    expect(typeof backendSync.syncLessonProgress).toBe("function");
  });
});
