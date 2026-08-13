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

export function validateLessonScoreSubmission(
  value: LessonScoreSubmission,
): string[] {
  const errors: string[] = [];
  if (!integerInRange(value.score, 0, 100)) {
    errors.push("Score must be an integer from 0 to 100.");
  }
  if (!integerInRange(value.xp, 0, 500)) {
    errors.push("XP must be an integer from 0 to 500.");
  }
  if (!integerInRange(value.durationMinutes, 0, 1440)) {
    errors.push("Duration is invalid.");
  }
  const pairs: Array<[number, number, string]> = [
    [value.vocabularyCorrect, value.vocabularyTotal, "Vocabulary"],
    [value.grammarCorrect, value.grammarTotal, "Grammar"],
    [value.reviewCorrect, value.reviewTotal, "Review"],
  ];
  for (const [correct, total, label] of pairs) {
    if (
      !integerInRange(total, 0, 500) ||
      !integerInRange(correct, 0, total)
    ) {
      errors.push(`${label} counts are invalid.`);
    }
  }
  const weighted =
    value.reviewTotal && value.vocabularyTotal && value.grammarTotal
      ? Math.round(
          (value.reviewCorrect / value.reviewTotal) * 60 +
            (value.vocabularyCorrect / value.vocabularyTotal) * 20 +
            (value.grammarCorrect / value.grammarTotal) * 20,
        )
      : value.score;
  if (Math.abs(weighted - value.score) > 1) {
    errors.push("Score does not match the 60/20/20 weighting.");
  }
  return errors;
}
