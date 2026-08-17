"use client";

import { useEffect } from "react";
import { ArrowRight, CheckCircle2, Play } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAppStore } from "@/store/app-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";

const learningSteps = [
  {
    title: "AIko picks the next lesson",
    detail: "You get one level-matched lesson instead of browsing a course catalog.",
  },
  {
    title: "One story becomes six phases",
    detail: "The same Japanese returns in vocabulary + kanji, grammar, reading, listening, and speaking.",
  },
  {
    title: "Your activity shapes what comes next",
    detail: "Mastery is recorded in the background and used for progress and future targeting.",
  },
];

export function LessonLibrary() {
  const progress = useAppStore((state) => state.progress);
  const backendLessons = useBackendLessonStore((state) => state.lessons);
  const backendLoading = useBackendLessonStore((state) => state.loading);
  const backendError = useBackendLessonStore((state) => state.error);
  const loadBackendLessons = useBackendLessonStore((state) => state.load);
  const assignedLesson =
    backendLessons.find(
      (lesson) => !progress.completedLessonIds.includes(lesson.id),
    ) ?? backendLessons[0] ?? null;

  useEffect(() => {
    void loadBackendLessons();
  }, [loadBackendLessons]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="mx-auto max-w-3xl text-center">
        <p className="section-kicker">Your learning path</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          One lesson at a time. AIko chooses what comes next.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-muted">
          Lessons stay at your Japanese level, reuse language across six connected phases, and feed what you learn back into your progress.
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
                Choosing your next lesson…
              </p>
              <p className="mt-2 text-xs text-muted">
                Looking for the best available match at your level.
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
                <Play className="size-6" aria-hidden="true" />
              </span>
              <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-moss-200">
                Your next {assignedLesson.level} lesson
              </p>
              <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Learn one story from six different angles.
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
                First understand the story. Then meet the same language again through vocabulary + kanji, grammar, reading, listening, and speaking so it has more than one chance to stick.
              </p>

              <div className="mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-2 text-xs font-medium text-white/65">
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  6 connected phases
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Grammar + translation
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Progress updates automatically
                </span>
              </div>

              <ButtonLink
                href={`/lesson/${assignedLesson.id}/preview`}
                className="mt-8 !bg-persimmon-500 px-8 hover:!bg-persimmon-600"
              >
                See lesson details
                <ArrowRight
                  className="size-4 transition-transform duration-180 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </ButtonLink>
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
                  "AIko will place the next level-matched lesson here when content is available."}
              </p>
            </div>
          </Card>
        )}
      </section>

      <section className="mt-10" aria-labelledby="how-aiko-works">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-kicker">How AIko works</p>
            <h2 id="how-aiko-works" className="mt-2 text-2xl font-semibold tracking-tight">
              The app handles the learning loop for you.
            </h2>
          </div>
          <ButtonLink href="/custom-topic" variant="secondary" className="mt-3 sm:mt-0">
            Choose my own topic
          </ButtonLink>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {learningSteps.map((step, index) => (
            <Card key={step.title} className="p-5 sm:p-6">
              <span className="grid size-9 place-items-center rounded-full bg-moss-100 text-sm font-bold text-moss-700">
                {index + 1}
              </span>
              <h3 className="mt-5 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{step.detail}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
