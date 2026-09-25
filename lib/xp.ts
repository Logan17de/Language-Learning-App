export const LESSON_COMPLETION_BASE_XP = 50;
export const LESSON_SCORE_MAX = 100;
export const LESSON_MAX_XP = LESSON_COMPLETION_BASE_XP + LESSON_SCORE_MAX;

export function calculateLessonXp(score: number): number {
  const normalizedScore = Math.max(
    0,
    Math.min(LESSON_SCORE_MAX, Math.round(Number.isFinite(score) ? score : 0)),
  );
  return LESSON_COMPLETION_BASE_XP + normalizedScore;
}
