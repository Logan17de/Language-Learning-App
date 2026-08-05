import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commuteLesson } from "@/data/mock-lessons";
import { buildMasteryEvidence } from "@/lib/sync/backend-sync";
import { createEmptyLessonSession } from "@/store/app-store";
import type { LessonPackage, StoryWord } from "@/types/lesson";
import type { Json } from "@/types/database";

const kanjiWord: StoryWord = {
  id: "word-station",
  libraryId: "kanji-station",
  libraryType: "kanji",
  position: 1,
  surface: "\u99c5",
  reading: "\u3048\u304d",
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
  cue: "\u99c5",
  choices: ["\u3048\u304d", "\u3044\u304d", "\u3048\u304e", "\u3044\u3051"],
  correctAnswer: "\u3048\u304d",
  acceptedAnswers: ["\u3048\u304d"],
  targetItemIds: [],
  inspectableTerms: [kanjiWord],
};

const lesson: LessonPackage = {
  ...commuteLesson,
  kanji: [
    {
      libraryId: "kanji-station",
      character: "\u99c5",
      reading: "\u3048\u304d",
      meaning: "station",
    },
  ],
  vocabularyQuestions: [vocabularyQuestion],
};

function evidenceRecords(events: Json[]): Array<Record<string, unknown>> {
  return events as unknown as Array<Record<string, unknown>>;
}

describe("section-batched kanji mastery", () => {
  it("keeps a new kanji at zero until its section is completed", () => {
    const storageMigration = readFileSync(
      "supabase/migrations/20260727100000_adaptive_question_banks.sql",
      "utf8",
    );
    expect(storageMigration).toContain(
      "select auth.uid(), 'kanji', value->>'libraryId', 0, 0, 0, 0, 0, 0",
    );

    const session = createEmptyLessonSession(lesson.id);
    session.vocabularyAnswers = [
      {
        questionId: vocabularyQuestion.id,
        mode: vocabularyQuestion.mode,
        selectedAnswer: vocabularyQuestion.correctAnswer,
        correct: true,
        attempts: 1,
      },
    ];

    expect(buildMasteryEvidence(lesson, session, "vocabulary")).toEqual([]);
  });

  it("adds recognition evidence after an answer completed without kanji help", () => {
    const session = createEmptyLessonSession(lesson.id);
    session.completedPhaseIds = ["vocabulary"];
    session.vocabularyAnswers = [
      {
        questionId: vocabularyQuestion.id,
        mode: vocabularyQuestion.mode,
        selectedAnswer: vocabularyQuestion.correctAnswer,
        correct: true,
        attempts: 1,
      },
    ];

    const evidence = evidenceRecords(
      buildMasteryEvidence(lesson, session, "vocabulary"),
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
    session.vocabularyAnswers = [
      {
        questionId: vocabularyQuestion.id,
        mode: vocabularyQuestion.mode,
        selectedAnswer: vocabularyQuestion.correctAnswer,
        correct: true,
        attempts: 1,
      },
    ];

    const evidence = evidenceRecords(
      buildMasteryEvidence(lesson, session, "vocabulary"),
    );
    expect(
      evidence.some(
        (event) =>
          event.itemKey === "kanji-station" && event.signal === "exposure",
      ),
    ).toBe(false);
    expect(evidence).toContainEqual(
      expect.objectContaining({
        itemKey: "kanji-station",
        dimension: "recognition",
        signal: "revealed_reading",
      }),
    );
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
      (question) => ({
        questionId: question.id,
        mode: question.mode,
        selectedAnswer: question.correctAnswer,
        correct: true,
        attempts: 1,
      }),
    );

    const evidence = evidenceRecords(
      buildMasteryEvidence(repeatedLesson, session, "vocabulary"),
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

  it("syncs mastery at section transitions instead of after each answer", () => {
    const player = readFileSync(
      "components/lesson/lesson-player.tsx",
      "utf8",
    );
    expect(player).not.toContain("syncLessonProgress(lesson, withTime)");
    expect(player).toContain(
      "syncLessonProgress(lesson, saved, currentPhase.id)",
    );
  });
});
