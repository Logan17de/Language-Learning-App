"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LessonResult } from "@/components/lesson/lesson-result";
import { ButtonLink } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import type { LessonPackage } from "@/types/lesson";

export default function LessonCompletePage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId ?? "";
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const session = useAppStore((state) => state.lessonSessions[lessonId]);
  const cachedBackendLesson = useBackendLessonStore((state) =>
    state.lessons.find((item) => item.id === lessonId),
  );
  const loadBackendLesson = useBackendLessonStore((state) => state.loadOne);
  const [requestedBackendLesson, setRequestedBackendLesson] =
    useState<LessonPackage | undefined>();
  const [backendResolved, setBackendResolved] = useState(
    Boolean(cachedBackendLesson),
  );

  useEffect(() => {
    if (cachedBackendLesson || !lessonId) {
      setBackendResolved(true);
      return;
    }
    let active = true;
    void loadBackendLesson(lessonId).then((value) => {
      if (!active) return;
      setRequestedBackendLesson(value);
      setBackendResolved(true);
    });
    return () => {
      active = false;
    };
  }, [cachedBackendLesson, lessonId, loadBackendLesson]);

  const lesson = cachedBackendLesson ?? requestedBackendLesson;

  if (!hasHydrated || !backendResolved) {
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
          <p className="mt-3 text-stone-500">
            Your saved session is ready to continue.
          </p>
          <ButtonLink href={`/lesson/${lesson.id}/play`} className="mt-6">
            Resume lesson
          </ButtonLink>
        </div>
      </main>
    );
  }
  return <LessonResult lesson={lesson} result={session.completionResult} />;
}
