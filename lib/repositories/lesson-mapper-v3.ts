import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson as mapBaseLesson } from "@/lib/repositories/lesson-mapper";
import type { LessonPackage } from "@/types/lesson";

const PLAYABLE_COUNTS = {
  vocabulary: 7,
  grammar: 7,
  reading: 5,
  listening: 5,
  speaking: 5,
} as const;

/**
 * Historical versions may physically contain older 10/13-question practice
 * sets. The learner contract is fixed at 7/7/5/5/5, so extra stored rows stay
 * historical and never enter the playable package.
 */
export function mapCanonicalLesson(value: CanonicalLesson): LessonPackage {
  const lesson = mapBaseLesson(value);
  return {
    ...lesson,
    vocabularyQuestions: lesson.vocabularyQuestions.slice(0, PLAYABLE_COUNTS.vocabulary),
    grammarQuestions: lesson.grammarQuestions.slice(0, PLAYABLE_COUNTS.grammar),
    readingQuestions: (lesson.readingQuestions ?? []).slice(0, PLAYABLE_COUNTS.reading),
    listeningExercises: lesson.listeningExercises.slice(0, PLAYABLE_COUNTS.listening),
    speakingExercises: lesson.speakingExercises.slice(0, PLAYABLE_COUNTS.speaking),
    premiumPhaseAccess: value.premiumPhaseAccess,
  };
}
