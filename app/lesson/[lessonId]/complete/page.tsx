"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LessonResult } from "@/components/lesson/lesson-result";
import { ButtonLink } from "@/components/ui/button";
import { getLessonById } from "@/data/mock-lessons";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import type { LessonPackage } from "@/types/lesson";

export default function LessonCompletePage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId ?? "";
  const supabaseMode = getBackendMode() === "supabase";
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const override = useAdminStore((state) => state.lessonOverrides[lessonId]);
  const deleted = useAdminStore((state) => state.deletedLessonIds.includes(lessonId));
  const session = useAppStore((state) => state.lessonSessions[lessonId]);
  const generatedLesson = useAppStore((state) =>
    state.generatedLessons.find((item) => item.id === lessonId),
  );
  const cachedBackendLesson = useBackendLessonStore((state) =>
    state.lessons.find((item) => item.id === lessonId),
  );
  const loadBackendLesson = useBackendLessonStore((state) => state.loadOne);
  const [requestedBackendLesson, setRequestedBackendLesson] =
    useState<LessonPackage | undefined>();
  const [backendResolved, setBackendResolved] = useState(!supabaseMode);

  useEffect(() => {
    if (!supabaseMode || cachedBackendLesson || !lessonId) return;
    let active = true;
    void loadBackendLesson(lessonId).then((value) => {
      if (!active) return;
      setRequestedBackendLesson(value);
      setBackendResolved(true);
    });
    return () => {
      active = false;
    };
  }, [cachedBackendLesson, lessonId, loadBackendLesson, supabaseMode]);

  const localLesson = deleted
    ? undefined
    : override ?? getLessonById(lessonId) ?? generatedLesson;
  const lesson = supabaseMode
    ? cachedBackendLesson ?? requestedBackendLesson
    : localLesson;
  const backendReady = !supabaseMode || backendResolved || Boolean(cachedBackendLesson);

  if (!hasHydrated || !backendReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" />
      </main>
    );
  }
  if (!lesson) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div>
          <h1 className="text-3xl font-semibold">Lesson not found</h1>
          <ButtonLink href="/home" className="mt-6">
            Return home
          </ButtonLink>
        </div>
      </main>
    );
  }
  if (!session?.completionResult) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div>
          <h1 className="text-3xl font-semibold">Finish the lesson first.</h1>
          <p className="mt-3 text-stone-500">Your saved session is ready to continue.</p>
          <ButtonLink href={`/lesson/${lesson.id}/play`} className="mt-6">
            Resume lesson
          </ButtonLink>
        </div>
      </main>
    );
  }
  return <LessonResult lesson={lesson} result={session.completionResult} />;
}
