import type { LessonPackage } from "@/types/lesson";

export function mergeCanonicalLessons(
  seedLessons: LessonPackage[],
  generatedLessons: LessonPackage[],
  overrides: Record<string, LessonPackage>,
  deletedLessonIds: string[],
): LessonPackage[] {
  const deleted = new Set(deletedLessonIds);
  const canonical = new Map<string, LessonPackage>();
  [...seedLessons, ...generatedLessons].forEach((lesson) => {
    if (!deleted.has(lesson.id)) canonical.set(lesson.id, overrides[lesson.id] ?? lesson);
  });
  Object.values(overrides).forEach((lesson) => {
    if (!deleted.has(lesson.id)) canonical.set(lesson.id, lesson);
  });
  return [...canonical.values()];
}

export function learnerVisibleLessons(lessons: LessonPackage[]): LessonPackage[] {
  return lessons.filter((lesson) => lesson.status === "published");
}
