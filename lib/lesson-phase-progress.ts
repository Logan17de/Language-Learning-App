import type { LessonPackage } from "@/types/lesson";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";

function hasAnswerForEveryQuestion(
  questionIds: string[],
  answerIds: string[],
): boolean {
  if (!questionIds.length) return false;
  const answered = new Set(answerIds);
  return questionIds.every((id) => answered.has(id));
}

export function phaseIsComplete(
  session: LessonSession,
  phaseId: LessonPhaseId,
  lesson: LessonPackage,
): boolean {
  switch (phaseId) {
    case "story":
      return session.storyComplete;
    case "vocabulary":
      return hasAnswerForEveryQuestion(
        lesson.vocabularyQuestions.map((question) => question.id),
        session.vocabularyAnswers.map((answer) => answer.questionId),
      );
    case "grammar":
      return hasAnswerForEveryQuestion(
        lesson.grammarQuestions.map((question) => question.id),
        session.grammarAnswers.map((answer) => answer.questionId),
      );
    case "reading":
      return hasAnswerForEveryQuestion(
        (lesson.readingQuestions ?? []).map((question) => question.id),
        (session.readingAnswers ?? []).map((answer) => answer.questionId),
      );
    case "listening":
      return (
        session.listeningComplete &&
        lesson.listeningExercises.every((exercise) =>
          session.listeningEvents.some(
            (event) => event.type === "answer" && event.questionId === exercise.id,
          ),
        )
      );
    case "speaking":
      return (
        session.speakingComplete &&
        lesson.speakingExercises.every((exercise) =>
          session.speakingEvents.some(
            (event) => event.exerciseId === exercise.id,
          ),
        )
      );
  }
}
