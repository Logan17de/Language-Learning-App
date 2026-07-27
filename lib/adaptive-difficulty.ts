import type { ExerciseDifficulty } from "@/types/lesson";

export interface AdaptiveQuestion {
  id: string;
  difficulty: ExerciseDifficulty;
}

export interface AdaptiveAnswer {
  questionId: string;
  correct: boolean;
}

export interface AdaptiveSelectionOptions {
  targetCount?: number;
}

export function selectNextAdaptiveQuestionIndex<
  Question extends AdaptiveQuestion,
>(
  questions: Question[],
  answers: AdaptiveAnswer[],
  options: AdaptiveSelectionOptions = {},
): number | null {
  const targetCount = Math.min(
    options.targetCount ?? Math.min(10, questions.length),
    questions.length,
  );
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  if (answers.length >= targetCount) return null;

  const unanswered = questions
    .map((question, index) => ({ question, index }))
    .filter(({ question }) => !answeredIds.has(question.id));
  if (!unanswered.length) return null;

  const questionById = new Map(
    questions.map((question) => [question.id, question]),
  );
  const answeredByDifficulty = (difficulty: ExerciseDifficulty) =>
    answers.filter(
      (answer) => questionById.get(answer.questionId)?.difficulty === difficulty,
    );
  const easyAnswers = answeredByDifficulty("Easy");
  const mediumAnswers = answeredByDifficulty("Medium");
  const hardAnswers = answeredByDifficulty("Hard");
  const minimums = difficultyMinimums(targetCount);
  const finalSlot = answers.length === targetCount - 1;

  if (easyAnswers.length < minimums.easy) {
    return choose(unanswered, "Easy", ["Medium", "Hard"]);
  }
  if (finalSlot) {
    return choose(unanswered, "Hard", ["Medium", "Easy"]);
  }

  const slotsBeforeFinal = targetCount - answers.length - 1;
  const mediumStillRequired = Math.max(
    0,
    minimums.medium - mediumAnswers.length,
  );
  if (mediumStillRequired >= slotsBeforeFinal) {
    return choose(unanswered, "Medium", ["Easy", "Hard"]);
  }

  const easyAccuracy =
    easyAnswers.filter((answer) => answer.correct).length /
    Math.max(1, easyAnswers.length);
  if (easyAccuracy < 0.8) {
    return choose(unanswered, "Easy", ["Medium", "Hard"]);
  }

  const latest = answers.at(-1);
  const latestDifficulty = latest
    ? questionById.get(latest.questionId)?.difficulty
    : undefined;
  let desired: ExerciseDifficulty = "Medium";
  let fallback: ExerciseDifficulty[] = ["Easy", "Hard"];

  if (latestDifficulty === "Medium") {
    desired = latest?.correct ? "Hard" : "Medium";
    fallback = latest?.correct ? ["Medium", "Easy"] : ["Easy", "Hard"];
  } else if (latestDifficulty === "Hard") {
    desired = latest?.correct ? "Hard" : "Medium";
    fallback = latest?.correct ? ["Medium", "Easy"] : ["Easy", "Hard"];
  } else if (latestDifficulty === "Easy" && !latest?.correct) {
    desired = "Easy";
    fallback = ["Medium", "Hard"];
  }

  if (desired === "Hard" && hardAnswers.length >= minimums.maximumHard) {
    desired = "Medium";
    fallback = ["Easy", "Hard"];
  }

  const hardAvailable = unanswered.filter(
    ({ question }) => question.difficulty === "Hard",
  ).length;
  if (desired === "Hard" && hardAvailable <= 1) {
    desired = "Medium";
    fallback = ["Easy", "Hard"];
  }

  return choose(unanswered, desired, fallback);
}

export function recommendedDifficultyFromAccuracy(
  answers: AdaptiveAnswer[],
): ExerciseDifficulty {
  if (!answers.length) return "Easy";
  const recent = answers.slice(-5);
  const accuracy =
    recent.filter((answer) => answer.correct).length / recent.length;
  if (recent.length >= 5 && accuracy >= 0.8) return "Hard";
  if (accuracy >= 0.6) return "Medium";
  return "Easy";
}

function difficultyMinimums(targetCount: number): {
  easy: number;
  medium: number;
  hard: number;
  maximumHard: number;
} {
  if (targetCount >= 10) {
    return { easy: 5, medium: 2, hard: 1, maximumHard: 3 };
  }
  if (targetCount >= 5) {
    return { easy: 2, medium: 2, hard: 1, maximumHard: 2 };
  }
  return {
    easy: 1,
    medium: targetCount >= 2 ? 1 : 0,
    hard: targetCount >= 3 ? 1 : 0,
    maximumHard: 1,
  };
}

function choose(
  unanswered: Array<{ question: AdaptiveQuestion; index: number }>,
  desired: ExerciseDifficulty,
  fallback: ExerciseDifficulty[],
): number {
  for (const difficulty of [desired, ...fallback]) {
    const match = unanswered.find(
      ({ question }) => question.difficulty === difficulty,
    );
    if (match) return match.index;
  }
  return unanswered[0].index;
}
