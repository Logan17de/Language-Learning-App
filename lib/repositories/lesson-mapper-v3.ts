import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson as mapBaseLesson } from "@/lib/repositories/lesson-mapper";
import type { LessonPackage } from "@/types/lesson";

/**
 * Keeps shared lesson content reusable. Readings stay available through
 * deliberate word inspection instead of appearing beside unknown kanji.
 */
export function mapCanonicalLesson(value: CanonicalLesson): LessonPackage {
  return mapBaseLesson(value);
}
