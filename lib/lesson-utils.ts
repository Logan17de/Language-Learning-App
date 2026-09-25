import type { LessonPackage } from "@/types/lesson";

export function getLessonLoadLabel(lesson: LessonPackage): string {
  const learningItems = lesson.kanji.length + lesson.grammar.length;
  if (learningItems <= 3) return "Light";
  if (learningItems <= 6) return "Balanced";
  return "Focused";
}

export function getPhaseProgress(index: number, total: number): number {
  return Math.round(((index + 1) / total) * 100);
}
