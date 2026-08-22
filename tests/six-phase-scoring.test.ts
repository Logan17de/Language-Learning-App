import { describe, expect, it } from "vitest";
import { commuteLesson } from "@/data/mock-lessons";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import { createEmptyLessonSession } from "@/store/app-store";

function perfectSession() {
  const lesson = {
    ...commuteLesson,
    story: commuteLesson.story.map((line) => ({ ...line, words: [] })),
    reviewQuestions: [],
  };
  const session = createEmptyLessonSession(lesson.id);
  session.storyComplete = true;
  session.vocabularyAnswers = lesson.vocabularyQuestions.map((question) => ({
    questionId: question.id,
    mode: question.mode,
    selectedAnswer: question.correctAnswer,
    correct: true,
    attempts: 1,
  }));
  session.grammarAnswers = lesson.grammarQuestions.map((question) => ({
    questionId: question.id,
    type: question.type,
    selectedAnswer: question.correctAnswer,
    correct: true,
    skill: question.skill,
    attempts: 1,
  }));
  session.readingAnswers = (lesson.readingQuestions ?? []).map((question) => ({
    questionId: question.id,
    response: question.answer,
  }));
  session.listeningComplete = true;
  session.listeningEvents = lesson.listeningExercises.map((exercise, index) => ({
    id: `listening-perfect-${index}`,
    questionId: exercise.id,
    type: "answer" as const,
    replayCount: 0,
    correct: true,
    selectedAnswer: exercise.correctAnswer,
    elapsedSeconds: index + 1,
  }));
  session.speakingComplete = true;
  session.speakingEvents = lesson.speakingExercises.map((exercise, index) => ({
    id: `speaking-perfect-${index}`,
    exerciseId: exercise.id,
    mode: exercise.mode,
    attempt: 1,
    evaluationAvailable: true,
    pronunciationConfidence: 100,
    grammarAccuracy: 100,
    recognizedWords: [],
    missedWords: [],
    successfulRetry: false,
  }));
  session.elapsedSeconds = 30 * 60;
  return { lesson, session };
}

describe("six-phase lesson scoring", () => {
  it("allows a perfect lesson to score 100 without Final Review", () => {
    const { lesson, session } = perfectSession();

    const result = calculateLessonCompletion(lesson, session);

    expect(lesson.reviewQuestions).toEqual([]);
    expect(result.score).toBe(100);
  });

  it("scores explicitly skipped sections as zero even after partial answers", () => {
    const { lesson, session } = perfectSession();
    session.skippedPhaseIds = [
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
    ];

    expect(calculateLessonCompletion(lesson, session).score).toBe(0);
  });
});
