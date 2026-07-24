"use client";

import type { LessonPackage } from "@/types/lesson";
import { isPlayableLesson } from "@/lib/lesson-search-utils";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { LessonPreview } from "@/components/lesson/lesson-preview";
import { LessonPlayer } from "@/components/lesson/lesson-player";
import { ButtonLink } from "@/components/ui/button";

export function LessonRouteResolver({
  lessonId,
  staticLesson,
  mode,
}: {
  lessonId: string;
  staticLesson?: LessonPackage;
  mode: "preview" | "play";
}) {
  const hydrated = useAppStore((state) => state.hasHydrated);
  const adminHydrated = useAdminStore((state) => state.hasHydrated);
  const override = useAdminStore((state) => state.lessonOverrides[lessonId]);
  const deleted = useAdminStore((state) => state.deletedLessonIds.includes(lessonId));
  const generatedLesson = useAppStore((state) => state.generatedLessons.find((lesson) => lesson.id === lessonId));
  const lesson = deleted ? undefined : override ?? staticLesson ?? generatedLesson;

  if (!hydrated || !adminHydrated) {
    return <main className="grid min-h-screen place-items-center bg-paper"><span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" /></main>;
  }
  if (!lesson || !isPlayableLesson(lesson)) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div><p className="section-kicker">Lesson unavailable</p><h1 className="mt-4 text-3xl font-semibold">This lesson could not be loaded.</h1><p className="mt-3 text-stone-500">It may be missing or failed the local structure check.</p><ButtonLink href="/learn" className="mt-6">Return to library</ButtonLink></div>
      </main>
    );
  }
  return mode === "preview" ? <LessonPreview lesson={lesson} /> : <LessonPlayer lesson={lesson} />;
}
