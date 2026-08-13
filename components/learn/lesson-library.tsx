"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Play,
  RotateCcw,
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useBackendLessonStore } from "@/store/backend-lesson-store";

export function LessonLibrary() {
  const router = useRouter();
  const backendLessons = useBackendLessonStore((state) => state.lessons);
  const backendLoading = useBackendLessonStore((state) => state.loading);
  const backendAssigning = useBackendLessonStore((state) => state.assigning);
  const backendError = useBackendLessonStore((state) => state.error);
  const loadBackendLessons = useBackendLessonStore((state) => state.load);
  const assignNewBackendLesson = useBackendLessonStore((state) => state.assignNew);
  const sessions = useAppStore((state) => state.lessonSessions);

  const activeSession = useMemo(
    () =>
      Object.values(sessions)
        .filter((item) => !item.completed)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0],
    [sessions],
  );

  const assignedLesson = useMemo(() => {
    if (activeSession) {
      const activeLesson = backendLessons.find(
        (lesson) => lesson.id === activeSession.lessonId,
      );
      if (activeLesson) return activeLesson;
    }
    return backendLessons[0] ?? null;
  }, [activeSession, backendLessons]);

  const assignedSession = assignedLesson ? sessions[assignedLesson.id] : undefined;
  const isResuming = Boolean(assignedSession && !assignedSession.completed);

  useEffect(() => {
    void loadBackendLessons();
  }, [loadBackendLessons]);

  async function startNewLesson() {
    if (!assignedLesson) return;
    const next = await assignNewBackendLesson(assignedLesson.id);
    if (next) router.push(`/lesson/${next.id}/play`);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="mx-auto max-w-3xl text-center">
        <p className="section-kicker">Learn</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {isResuming ? "Your lesson is saved." : "Your next lesson is ready."}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted">
          {isResuming
            ? "Resume from your checkpoint, or choose a fresh lesson. Everything you already attempted stays saved."
            : "AIko has selected one lesson for your level. The title and topic stay hidden until you begin."}
        </p>
      </header>

      <section className="mt-9" aria-label="Assigned lesson">
        {backendLoading ? (
          <Card
            className="grid min-h-80 place-items-center overflow-hidden !bg-moss-50"
            role="status"
            aria-live="polite"
          >
            <div className="text-center">
              <span className="mx-auto block size-14 motion-safe:animate-pulse rounded-2xl bg-moss-100" />
              <p className="mt-5 text-sm font-semibold text-moss-700">
                Preparing your lesson…
              </p>
              <p className="mt-2 text-xs text-muted">
                Finding the best available match for your level.
              </p>
            </div>
          </Card>
        ) : assignedLesson ? (
          <Card className="relative overflow-hidden !border-moss-900 !bg-moss-900 p-8 text-center text-white shadow-float sm:p-12">
            <div
              className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full border-[42px] border-white/[0.04]"
              aria-hidden="true"
            />
            <div className="relative">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.07] text-persimmon-300">
                {isResuming ? (
                  <RotateCcw className="size-6" aria-hidden="true" />
                ) : (
                  <Play className="size-6" aria-hidden="true" />
                )}
              </span>
              <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-moss-200">
                {assignedLesson.level} lesson
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                {isResuming
                  ? "Continue your learning loop."
                  : "Start with a clean reveal."}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                {isResuming
                  ? "Your last activity, partial mastery evidence, and elapsed time are preserved."
                  : "No title, topic, story, or vocabulary is shown before you begin."}
              </p>

              <div className="mx-auto mt-7 flex max-w-lg flex-wrap justify-center gap-2 text-xs font-medium text-white/65">
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  7 connected stages
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Speaking practice
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Final review
                </span>
              </div>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink
                  href={`/lesson/${assignedLesson.id}/play`}
                  className="!bg-persimmon-500 px-8 hover:!bg-persimmon-600"
                >
                  {isResuming ? "Resume lesson" : "Start lesson"}
                  <ArrowRight
                    className="size-4 transition-transform duration-180 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </ButtonLink>
                {isResuming && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={backendAssigning}
                    onClick={() => void startNewLesson()}
                    className="border-white/20 bg-white/10 px-8 text-white hover:border-white/30 hover:bg-white/15"
                  >
                    {backendAssigning ? (
                      <LoaderCircle
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Play className="size-4" aria-hidden="true" />
                    )}
                    {backendAssigning ? "Finding lesson…" : "Start new lesson"}
                  </Button>
                )}
              </div>
              {backendError && (
                <p
                  role="alert"
                  className="mx-auto mt-5 max-w-lg rounded-2xl border border-persimmon-400/30 bg-persimmon-500/10 px-4 py-3 text-sm font-semibold text-persimmon-200"
                >
                  {backendError}
                </p>
              )}
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-72 place-items-center border-dashed text-center">
            <div className="max-w-md">
              <CheckCircle2
                className="mx-auto size-10 text-moss-500"
                aria-hidden="true"
              />
              <h2 className="mt-5 text-xl font-semibold">
                No lesson is available right now.
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {backendError ||
                  "AIko will show the next level-matched lesson when content is available."}
              </p>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
