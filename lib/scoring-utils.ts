import type { LessonPackage } from "@/types/lesson";
import {
  storyWordIndependence,
  storyWordScores,
} from "@/lib/story-support";
import type {
  GrammarAnswer,
  LessonCompletionResult,
  LessonSession,
  ReviewAnswer,
  ReviewResult,
  VocabularyAnswer,
} from "@/types/lesson-session";

export function evaluateAnswer(selectedAnswer: string, correctAnswer: string): boolean {
  return selectedAnswer.trim() === correctAnswer.trim();
}

export function upsertVocabularyAnswer(
  answers: VocabularyAnswer[],
  next: Omit<VocabularyAnswer, "attempts">,
): VocabularyAnswer[] {
  const existing = answers.find((answer) => answer.questionId === next.questionId);
  return [
    ...answers.filter((answer) => answer.questionId !== next.questionId),
    { ...next, attempts: (existing?.attempts ?? 0) + 1 },
  ];
}

export function upsertGrammarAnswer(
  answers: GrammarAnswer[],
  next: Omit<GrammarAnswer, "attempts">,
): GrammarAnswer[] {
  const existing = answers.find((answer) => answer.questionId === next.questionId);
  return [
    ...answers.filter((answer) => answer.questionId !== next.questionId),
    { ...next, attempts: (existing?.attempts ?? 0) + 1 },
  ];
}

export function calculateReviewResult(answers: ReviewAnswer[], totalCount = 5): ReviewResult {
  const correctCount = answers.filter((answer) => answer.correct).length;
  return {
    answers,
    correctCount,
    totalCount,
    score: Math.round((correctCount / totalCount) * 100),
  };
}

export function calculateLessonCompletion(
  lesson: LessonPackage,
  session: LessonSession,
): LessonCompletionResult {
  const reviewScore = session.reviewResult?.score ?? 0;
  const vocabularyAccuracy = ratio(
    session.vocabularyAnswers.filter((answer) => answer.correct).length,
    Math.max(1, session.vocabularyAnswers.length),
  );
  const grammarAccuracy = ratio(
    session.grammarAnswers.filter((answer) => answer.correct).length,
    Math.max(1, session.grammarAnswers.length),
  );
  const storyWords = lesson.story.flatMap((line) =>
    line.words.map((word) => ({ lineId: line.id, word })),
  );
  const storyIndependence = storyWords.length
    ? storyWords.reduce(
        (total, item) =>
          total +
          storyWordIndependence(
            session.storyInteractions,
            item.lineId,
            item.word,
          ),
        0,
      ) /
      storyWords.length /
      100
    : 1;
  const score = Math.round(
    reviewScore * 0.5 +
      vocabularyAccuracy * 20 +
      grammarAccuracy * 20 +
      storyIndependence * 10,
  );
  const wordsNeedingReview = unique([
    ...storyWords
      .filter((item) => {
        const scores = storyWordScores(
          session.storyInteractions,
          item.lineId,
          item.word,
        );
        return (
          scores.meaning < item.word.baseMeaningScore ||
          scores.recognition < item.word.baseRecognitionScore ||
          scores.pronunciation < item.word.basePronunciationScore
        );
      })
      .map((item) => item.word.surface),
    ...session.vocabularyAnswers
      .filter((answer) => !answer.correct)
      .flatMap((answer) =>
        exerciseTerms(
          lesson,
          lesson.vocabularyQuestions.find(
            (question) => question.id === answer.questionId,
          )?.targetItemIds,
        ),
      ),
    ...session.grammarAnswers
      .filter((answer) => !answer.correct)
      .flatMap((answer) =>
        exerciseTerms(
          lesson,
          lesson.grammarQuestions.find(
            (question) => question.id === answer.questionId,
          )?.targetItemIds,
        ),
      ),
    ...session.readingEvents
      .filter((event) => ["paused-before-word", "pronunciation-issue", "stopped-at-word"].includes(event.type))
      .map((event) => event.term),
    ...session.reviewAnswers
      .filter((answer) => !answer.correct)
      .flatMap((answer) =>
        exerciseTerms(
          lesson,
          lesson.reviewQuestions.find(
            (question) => question.id === answer.questionId,
          )?.targetItemIds,
        ),
      ),
  ]).slice(0, 4);

  const speaking = session.speakingEvents.at(-1);
  return {
    lessonId: lesson.id,
    score,
    xpGained: 80 + Math.round(score * 0.7),
    durationMinutes: Math.max(1, Math.round(session.elapsedSeconds / 60)),
    recognitionChange: score >= 80 ? 4 : 2,
    pronunciationChange:
      speaking?.evaluationAvailable
        ? Math.max(0, Math.round((speaking.pronunciationConfidence - 60) / 8))
        : 0,
    grammarUnderstandingChange: Math.max(1, Math.round(grammarAccuracy * 4)),
    grammarProductionChange: Math.max(1, Math.round(grammarAccuracy * 3)),
    wordsNeedingReview,
    completedAt: new Date().toISOString(),
  };
}

function ratio(value: number, total: number): number {
  return Math.max(0, Math.min(1, value / total));
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function exerciseTerms(
  lesson: LessonPackage,
  targetItemIds: string[] | undefined,
): string[] {
  if (!targetItemIds?.length) return [];
  const targetIds = new Set(targetItemIds);
  return [
    ...lesson.kanji
      .filter((item) => item.libraryId && targetIds.has(item.libraryId))
      .map((item) => item.character),
    ...lesson.vocabulary
      .filter((item) => item.libraryId && targetIds.has(item.libraryId))
      .map((item) => item.term),
    ...lesson.grammar
      .filter((item) => item.libraryId && targetIds.has(item.libraryId))
      .map((item) => item.pattern),
  ];
}
