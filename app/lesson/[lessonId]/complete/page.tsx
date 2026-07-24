"use client";

import { useParams } from "next/navigation";
import { LessonResult } from "@/components/lesson/lesson-result";
import { ButtonLink } from "@/components/ui/button";
import { getLessonById } from "@/data/mock-lessons";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";

export default function LessonCompletePage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId ?? "";
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const override = useAdminStore((state) => state.lessonOverrides[lessonId]);
  const deleted = useAdminStore((state) => state.deletedLessonIds.includes(lessonId));
  const session = useAppStore((state) => state.lessonSessions[lessonId]);
  const generatedLesson = useAppStore((state) => state.generatedLessons.find((item) => item.id === lessonId));
  const lesson = deleted ? undefined : override ?? getLessonById(lessonId) ?? generatedLesson;

  if (!hasHydrated) {
    return <main className="grid min-h-screen place-items-center bg-paper"><span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" /></main>;
  }
  if (!lesson) {
    return <main className="grid min-h-screen place-items-center bg-paper p-6 text-center"><div><h1 className="text-3xl font-semibold">Lesson not found</h1><ButtonLink href="/home" className="mt-6">Return home</ButtonLink></div></main>;
  }
  if (!session?.completionResult) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div><h1 className="text-3xl font-semibold">Finish the lesson first.</h1><p className="mt-3 text-stone-500">Your saved session is ready to continue.</p><ButtonLink href={`/lesson/${lesson.id}/play`} className="mt-6">Resume lesson</ButtonLink></div>
      </main>
    );
  }
  return <LessonResult lesson={lesson} result={session.completionResult} />;
}
