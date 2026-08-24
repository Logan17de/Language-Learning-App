"use client";

import { useEffect, useState } from "react";
import type { LessonPackage } from "@/types/lesson";
import { isPlayableLesson } from "@/lib/lesson-search-utils";
import { LessonPreview } from "@/components/lesson/lesson-preview";
import { LessonPlayer } from "@/components/lesson/lesson-player";
import { ButtonLink } from "@/components/ui/button";
import { useBackendLessonStore } from "@/store/backend-lesson-store";

export function LessonRouteResolver({
  lessonId,
  mode,
}: {
  lessonId: string;
  mode: "preview" | "play";
}) {
  const loadBackendLesson = useBackendLessonStore((state) => state.loadOne);
  const cachedBackendLesson = useBackendLessonStore((state) =>
    state.lessons.find((lesson) => lesson.id === lessonId),
  );
  const [requestedBackendLesson, setRequestedBackendLesson] =
    useState<LessonPackage | undefined>();
  const [backendResolved, setBackendResolved] = useState(
    Boolean(cachedBackendLesson),
  );

  useEffect(() => {
    let active = true;
    if (cachedBackendLesson || !lessonId) {
      // Deferred off the synchronous effect body to avoid cascading renders.
      void Promise.resolve().then(() => {
        if (active) setBackendResolved(true);
      });
      return () => {
        active = false;
      };
    }
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

  if (!backendResolved) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper">
        <span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" />
      </main>
    );
  }
  if (!lesson || !isPlayableLesson(lesson)) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6 text-center">
        <div>
          <p className="section-kicker">Lesson unavailable</p>
          <h1 className="mt-4 text-3xl font-semibold">
            This lesson could not be loaded.
          </h1>
          <p className="mt-3 text-stone-500">
            It may be missing or failed the local structure check.
          </p>
          <ButtonLink href="/learn" className="mt-6">
            Return to library
          </ButtonLink>
        </div>
      </main>
    );
  }

  return mode === "preview" ? (
    <LessonPreview lesson={lesson} />
  ) : (
    <LessonPlayer
      lesson={lesson}
      routeLessonId={lessonId}
    />
  );
}
