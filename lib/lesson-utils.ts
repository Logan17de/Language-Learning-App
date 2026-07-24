import type { LessonPackage } from "@/types/lesson";

export function getLessonLoadLabel(lesson: LessonPackage): string {
  const newItems = lesson.kanji.filter((item) => !item.isReview).length + lesson.grammar.length;
  if (newItems <= 3) return "Light";
  if (newItems <= 6) return "Balanced";
  return "Focused";
}

export function getPhaseProgress(index: number, total: number): number {
  return Math.round(((index + 1) / total) * 100);
}
