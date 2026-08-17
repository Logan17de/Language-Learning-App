import type { LessonPackage } from "@/types/lesson";
import { isCanonicalPlayableLesson } from "@/lib/lesson-contract";

export function isPlayableLesson(lesson: LessonPackage): boolean {
  return isCanonicalPlayableLesson(lesson);
}
