import type { QuickReviewResult, ReviewActivityAnswer, ReviewSession } from "@/types/review-session";

export function calculateQuickReviewResult(session: ReviewSession): QuickReviewResult {
  const correctCount = session.answers.filter((answer) => answer.correct).length;
  const totalCount = session.activities.length;
  const improvedItemIds = session.answers.filter((answer) => answer.correct).map((answer) => answer.queueItemId);
  const weakItemIds = session.answers.filter((answer) => !answer.correct).map((answer) => answer.queueItemId);
  const score = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  return {
    score,
    correctCount,
    totalCount,
    improvedItemIds: Array.from(new Set(improvedItemIds)),
    weakItemIds: Array.from(new Set(weakItemIds)),
    xpEarned: 20 + correctCount * 6,
    completedAt: new Date().toISOString(),
  };
}

export function upsertReviewAnswer(
  answers: ReviewActivityAnswer[],
  answer: ReviewActivityAnswer,
): ReviewActivityAnswer[] {
  return [...answers.filter((item) => item.activityId !== answer.activityId), answer];
}
