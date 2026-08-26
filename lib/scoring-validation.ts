export interface LessonScoreSubmission {
  score: number;
  xp: number;
  durationMinutes: number;
  storyScore: number;
  vocabularyCorrect: number;
  vocabularyTotal: number;
  grammarCorrect: number;
  grammarTotal: number;
  readingCorrect: number;
  readingTotal: number;
  listeningCorrect: number;
  listeningTotal: number;
  speakingScore: number;
}

function integerInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function accuracy(correct: number, total: number): number {
  return total > 0 ? correct / total : 0;
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
  if (!integerInRange(value.storyScore, 0, 100)) {
    errors.push("Story score is invalid.");
  }
  if (!integerInRange(value.speakingScore, 0, 100)) {
    errors.push("Speaking score is invalid.");
  }
  const pairs: Array<[number, number, string]> = [
    [value.vocabularyCorrect, value.vocabularyTotal, "Vocabulary"],
    [value.grammarCorrect, value.grammarTotal, "Grammar"],
    [value.readingCorrect, value.readingTotal, "Reading"],
    [value.listeningCorrect, value.listeningTotal, "Listening"],
  ];
  for (const [correct, total, label] of pairs) {
    if (
      !integerInRange(total, 0, 500) ||
      !integerInRange(correct, 0, total)
    ) {
      errors.push(`${label} counts are invalid.`);
    }
  }

  if (errors.length === 0) {
    const weighted = Math.round(
      (value.storyScore / 100) * 15 +
        accuracy(value.vocabularyCorrect, value.vocabularyTotal) * 25 +
        accuracy(value.grammarCorrect, value.grammarTotal) * 25 +
        accuracy(value.readingCorrect, value.readingTotal) * 15 +
        accuracy(value.listeningCorrect, value.listeningTotal) * 10 +
        (value.speakingScore / 100) * 10,
    );
    if (Math.abs(weighted - value.score) > 1) {
      errors.push("Score does not match the six-phase weighting.");
    }
  }
  return errors;
}
