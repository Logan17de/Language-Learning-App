import type { LessonPackage } from "@/types/lesson";
import { storyWordIndependence } from "@/lib/story-support";
import { calculateLessonXp } from "@/lib/xp";
import type {
  GrammarAnswer,
  LessonCompletionResult,
  LessonSession,
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

export function calculateLessonCompletion(
  lesson: LessonPackage,
  session: LessonSession,
): LessonCompletionResult {
  const skippedPhases = new Set(session.skippedPhaseIds ?? []);
  const vocabularyAccuracy = skippedPhases.has("vocabulary") ? 0 : ratio(
    session.vocabularyAnswers.filter((answer) => answer.correct).length,
    Math.max(1, lesson.vocabularyQuestions.length),
  );
  // Grammar answers are scored against this lesson's own questions. The second
  // set used to be the Translation section's; that section is gone, so the list
  // was always empty and every term it fed evaluated to zero.
  const staticGrammarIds = new Set(lesson.grammarQuestions.map((question) => question.id));
  const relevantGrammarAnswers = session.grammarAnswers.filter((answer) =>
    staticGrammarIds.has(answer.questionId),
  );
  const grammarAccuracy = skippedPhases.has("grammar") ? 0 : ratio(
    relevantGrammarAnswers.filter((answer) => answer.correct).length,
    Math.max(1, lesson.grammarQuestions.length),
  );
  const readingQuestions = lesson.readingQuestions ?? [];
  const readingCorrect = session.readingAnswers.filter((answer) => {
    const question = readingQuestions.find(
      (item) => item.id === answer.questionId,
    );
    return question ? evaluateAnswer(answer.response, question.answer) : false;
  }).length;
  const readingAccuracy = skippedPhases.has("reading") ? 0 : ratio(
    readingCorrect,
    Math.max(1, readingQuestions.length),
  );
  const listeningAnswers = session.listeningEvents.filter(
    (event) => event.type === "answer",
  );
  const listeningAccuracy = skippedPhases.has("listening") ? 0 : ratio(
    listeningAnswers.filter((event) => event.correct === true).length,
    Math.max(1, lesson.listeningExercises.length),
  );
  const evaluatedSpeaking = session.speakingEvents.filter(
    (event) => event.evaluationAvailable,
  );
  const speakingAccuracy = skippedPhases.has("speaking")
    ? 0
    : evaluatedSpeaking.length > 0
    ? evaluatedSpeaking.reduce(
        (total, event) =>
          total +
          ratio(
            event.pronunciationConfidence + event.grammarAccuracy,
            200,
          ),
        0,
      ) / evaluatedSpeaking.length
    : session.speakingComplete
      ? 1
      : 0;

  const storyWords = lesson.story.flatMap((line) =>
    line.words.map((word) => ({ lineId: line.id, word })),
  );
  const storyIndependence = skippedPhases.has("story")
    ? 0
    : storyWords.length
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
    : session.storyComplete
      ? 1
      : 0;

  const score = Math.round(
    storyIndependence * 15 +
      vocabularyAccuracy * 25 +
      grammarAccuracy * 25 +
      readingAccuracy * 15 +
      listeningAccuracy * 10 +
      speakingAccuracy * 10,
  );

  return {
    lessonId: lesson.id,
    score,
    xpGained: calculateLessonXp(score),
    durationMinutes: Math.max(1, Math.round(session.elapsedSeconds / 60)),
    completedAt: new Date().toISOString(),
  };
}

function ratio(value: number, total: number): number {
  return Math.max(0, Math.min(1, value / total));
}


