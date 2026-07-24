export interface LessonScoreSubmission {
  score: number;
  xp: number;
  durationMinutes: number;
  vocabularyCorrect: number;
  vocabularyTotal: number;
  grammarCorrect: number;
  grammarTotal: number;
  reviewCorrect: number;
  reviewTotal: number;
}

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validateLessonScoreSubmission(value: LessonScoreSubmission): string[] {
  const errors: string[] = [];
  if (!integerInRange(value.score, 0, 100)) errors.push("Score must be an integer from 0 to 100.");
  if (!integerInRange(value.xp, 0, 500)) errors.push("XP must be an integer from 0 to 500.");
  if (!integerInRange(value.durationMinutes, 0, 1440)) errors.push("Duration is invalid.");
  const pairs: Array<[number, number, string]> = [
    [value.vocabularyCorrect, value.vocabularyTotal, "Vocabulary"],
    [value.grammarCorrect, value.grammarTotal, "Grammar"],
    [value.reviewCorrect, value.reviewTotal, "Review"],
  ];
  for (const [correct, total, label] of pairs) {
    if (!integerInRange(total, 0, 500) || !integerInRange(correct, 0, total)) errors.push(`${label} counts are invalid.`);
  }
  const weighted = value.reviewTotal && value.vocabularyTotal && value.grammarTotal
    ? Math.round((value.reviewCorrect / value.reviewTotal) * 60 + (value.vocabularyCorrect / value.vocabularyTotal) * 20 + (value.grammarCorrect / value.grammarTotal) * 20)
    : value.score;
  if (Math.abs(weighted - value.score) > 1) errors.push("Score does not match the 60/20/20 weighting.");
  return errors;
}

export function validateReviewScore(score: number, correctCount: number, totalCount: number, xp: number): string[] {
  const errors: string[] = [];
  if (!integerInRange(totalCount, 1, 500) || !integerInRange(correctCount, 0, totalCount)) errors.push("Review counts are invalid.");
  if (!integerInRange(score, 0, 100)) errors.push("Review score is invalid.");
  if (!integerInRange(xp, 0, 500)) errors.push("Review XP is invalid.");
  if (totalCount > 0 && Math.abs(Math.round((correctCount / totalCount) * 100) - score) > 1) errors.push("Review score does not match the submitted counts.");
  return errors;
}
