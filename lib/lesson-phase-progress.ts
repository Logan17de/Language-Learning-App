import type { LessonPackage } from "@/types/lesson";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";

const VOCABULARY_TARGET = 7;
const GRAMMAR_TARGET = 7;
const TRANSLATION_TARGET = 5;
const READING_TARGET = 5;
const LISTENING_TARGET = 5;
const SPEAKING_TARGET = 5;

function hasAnswerForEveryQuestion(
  questionIds: string[],
  answerIds: string[],
): boolean {
  if (!questionIds.length) return false;
  const answered = new Set(answerIds);
  return questionIds.every((id) => answered.has(id));
}

function canonicalQuestionIds(
  ids: string[],
  target: number,
): string[] {
  return ids.slice(0, target);
}

export function grammarStandardIsComplete(
  session: LessonSession,
  lesson: LessonPackage,
): boolean {
  const ids = canonicalQuestionIds(
    lesson.grammarQuestions.map((question) => question.id),
    GRAMMAR_TARGET,
  );
  return (
    ids.length === GRAMMAR_TARGET &&
    hasAnswerForEveryQuestion(
      ids,
      session.grammarAnswers.map((answer) => answer.questionId),
    )
  );
}

export function phaseIsComplete(
  session: LessonSession,
  phaseId: LessonPhaseId,
  lesson: LessonPackage,
): boolean {
  switch (phaseId) {
    case "story":
      return session.storyComplete;
    case "vocabulary": {
      const ids = canonicalQuestionIds(
        lesson.vocabularyQuestions.map((question) => question.id),
        VOCABULARY_TARGET,
      );
      return (
        ids.length === VOCABULARY_TARGET &&
        hasAnswerForEveryQuestion(
          ids,
          session.vocabularyAnswers.map((answer) => answer.questionId),
        )
      );
    }
    case "grammar": {
      if (!grammarStandardIsComplete(session, lesson)) return false;
      if (lesson.premiumPhaseAccess === "locked") return true;

      const answerIds = session.grammarAnswers.map((answer) => answer.questionId);
      const translationQuestions = (session.grammarTranslationQuestions ?? []).slice(
        0,
        TRANSLATION_TARGET,
      );
      return (
        translationQuestions.length === TRANSLATION_TARGET &&
        hasAnswerForEveryQuestion(
          translationQuestions.map((question) => question.id),
          answerIds,
        )
      );
    }
    case "reading": {
      const ids = canonicalQuestionIds(
        (lesson.readingQuestions ?? []).map((question) => question.id),
        READING_TARGET,
      );
      return (
        ids.length === READING_TARGET &&
        hasAnswerForEveryQuestion(
          ids,
          (session.readingAnswers ?? []).map((answer) => answer.questionId),
        )
      );
    }
    case "listening": {
      const exercises = lesson.listeningExercises.slice(0, LISTENING_TARGET);
      return (
        exercises.length === LISTENING_TARGET &&
        session.listeningComplete &&
        exercises.every((exercise) =>
          session.listeningEvents.some(
            (event) => event.type === "answer" && event.questionId === exercise.id,
          ),
        )
      );
    }
    case "speaking": {
      const exercises = lesson.speakingExercises.slice(0, SPEAKING_TARGET);
      return (
        exercises.length === SPEAKING_TARGET &&
        session.speakingComplete &&
        exercises.every((exercise) =>
          session.speakingEvents.some(
            (event) => event.exerciseId === exercise.id,
          ),
        )
      );
    }
  }
}
