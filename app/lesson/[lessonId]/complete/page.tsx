"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LessonResult } from "@/components/lesson/lesson-result";
import { ButtonLink } from "@/components/ui/button";
import { getBackendMode } from "@/lib/supabase/config";
import { loadCanonicalLessonCompletion } from "@/lib/sync/backend-sync";
import {
  createEmptyLessonSession,
  useAppStore,
} from "@/store/app-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import type { LessonPackage } from "@/types/lesson";
import type { LessonCompletionResult } from "@/types/lesson-session";

export default function LessonCompletePage() {
  const params = useParams<{ lessonId: string }>();
  const lessonId = params?.lessonId ?? "";
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const session = useAppStore((state) => state.lessonSessions[lessonId]);
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const cachedBackendLesson = useBackendLessonStore((state) =>
    state.lessons.find((item) => item.id === lessonId),
  );
  const loadBackendLesson = useBackendLessonStore((state) => state.loadOne);
  const [requestedBackendLesson, setRequestedBackendLesson] =
    useState<LessonPackage | undefined>();
  const [backendResolved, setBackendResolved] = useState(
    Boolean(cachedBackendLesson),
  );
  const [canonicalResult, setCanonicalResult] =
    useState<LessonCompletionResult | null>(null);
  const [completionResolved, setCompletionResolved] = useState(
    getBackendMode() !== "supabase",
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

  useEffect(() => {
    if (getBackendMode() !== "supabase" || !lesson) return;
    let active = true;
    // Deferred off the synchronous effect body to avoid cascading renders.
    void Promise.resolve()
      .then(() => {
        if (active) setCompletionResolved(false);
      });
    void loadCanonicalLessonCompletion(lesson)
      .then((result) => {
        if (!active) return;
        setCanonicalResult(result);
        if (result) {
          const latest =
            useAppStore.getState().lessonSessions[lesson.id] ??
            createEmptyLessonSession(lesson.id);
          saveLessonSession({
            ...latest,
            completionResult: result,
            completionState: "completed",
            completed: true,
          });
        }
      })
      .finally(() => {
        if (active) setCompletionResolved(true);
      });
    return () => {
      active = false;
    };
  }, [lesson, saveLessonSession]);

  if (!hasHydrated || !backendResolved || !completionResolved) {
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

  const result =
    getBackendMode() === "supabase"
      ? canonicalResult
      : session?.completionResult ?? null;

  if (!result) {
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
  return <LessonResult lesson={lesson} result={result} />;
}
