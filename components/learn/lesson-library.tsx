"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Play, RotateCcw } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import {
  learnerVisibleLessons,
  mergeCanonicalLessons,
} from "@/lib/canonical-lessons";
import { selectNextLesson } from "@/lib/lesson-assignment";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBackendMode } from "@/lib/supabase/config";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import type { JLPTLevel } from "@/types/lesson";

export function LessonLibrary() {
  const [demoLoading, setDemoLoading] = useState(true);
  const backendLessons = useBackendLessonStore((state) => state.lessons);
  const backendLoading = useBackendLessonStore((state) => state.loading);
  const backendError = useBackendLessonStore((state) => state.error);
  const loadBackendLessons = useBackendLessonStore((state) => state.load);
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deletedLessonIds = useAdminStore((state) => state.deletedLessonIds);
  const completedIds = useAppStore(
    (state) => state.progress.completedLessonIds,
  );
  const sessions = useAppStore((state) => state.lessonSessions);
  const onboarding = useAppStore((state) => state.onboarding);
  const subscription = useAppStore((state) => state.subscription);
  const user = useAppStore((state) => state.user);
  const backendMode = getBackendMode();
  const premium = subscription.plan === "premium";

  const allDemoLessons = useMemo(
    () =>
      learnerVisibleLessons(
        mergeCanonicalLessons(
          mockLessons,
          generated,
          overrides,
          deletedLessonIds,
        ),
      ),
    [deletedLessonIds, generated, overrides],
  );

  const assignedLesson = useMemo(() => {
    const availableLessons =
      backendMode === "supabase" ? backendLessons : allDemoLessons;
    const activeLesson = availableLessons.find(
      (lesson) => sessions[lesson.id] && !sessions[lesson.id].completed,
    );
    if (activeLesson) return activeLesson;

    if (backendMode === "supabase") return backendLessons[0] ?? null;

    return (
      selectNextLesson({
        lessons: allDemoLessons,
        level: learnerLevel(onboarding.level ?? user.level),
        interests: onboarding.interests,
        premium,
        excludedLessonIds: completedIds,
        seed: [user.id, completedIds.length].join(":"),
      })?.lesson ?? null
    );
  }, [
    allDemoLessons,
    backendLessons,
    backendMode,
    completedIds,
    onboarding.interests,
    onboarding.level,
    premium,
    sessions,
    user.id,
    user.level,
  ]);

  const activeSession = assignedLesson
    ? sessions[assignedLesson.id]
    : undefined;
  const isResuming = Boolean(activeSession && !activeSession.completed);

  useEffect(() => {
    void loadBackendLessons();
    const timer = window.setTimeout(() => setDemoLoading(false), 320);
    return () => window.clearTimeout(timer);
  }, [loadBackendLessons]);

  const loading = backendLoading || (backendMode === "demo" && demoLoading);

  return (
    <div className="mx-auto max-w-4xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="text-center">
        <p className="section-kicker">Learn</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {isResuming ? "Continue where you stopped." : "Your next lesson is ready."}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl leading-7 text-stone-500">
          {isResuming
            ? "Your progress is saved. Resume the same lesson from the next activity."
            : "AIko has selected one lesson for your level. The title and topic remain hidden until you start."}
        </p>
      </header>

      <section className="mt-9">
        {loading ? (
          <div
            className="h-80 animate-pulse rounded-4xl bg-moss-50"
            aria-label="Preparing your lesson"
          />
        ) : assignedLesson ? (
          <Card className="relative overflow-hidden !bg-moss-900 p-8 text-center text-white sm:p-12">
            <div className="absolute -right-16 -top-20 size-64 rounded-full bg-persimmon-400/20 blur-3xl" />
            <div className="relative">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10 text-persimmon-400">
                {isResuming ? (
                  <RotateCcw className="size-6" />
                ) : (
                  <Play className="size-6" />
                )}
              </span>
              <p className="mt-7 text-xs font-bold uppercase tracking-[.18em] text-moss-200">
                {assignedLesson.level} lesson
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                {isResuming ? "Lesson in progress" : "Private lesson reveal"}
              </h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/65">
                {isResuming
                  ? "Continue the lesson you already started."
                  : "No title, topic, story, or vocabulary is shown before you begin."}
              </p>
              <ButtonLink
                href={
                  isResuming
                    ? "/lesson/" + assignedLesson.id + "/play"
                    : "/lesson/" + assignedLesson.id + "/play"
                }
                className="mt-8 bg-persimmon-500 px-8 hover:bg-persimmon-600"
              >
                {isResuming ? "Resume lesson" : "Start lesson"}
                <ArrowRight className="size-4" />
              </ButtonLink>
            </div>
          </Card>
        ) : (
          <Card className="grid min-h-72 place-items-center border-dashed text-center">
            <div>
              <CheckCircle2 className="mx-auto size-10 text-moss-500" />
              <h2 className="mt-5 text-xl font-semibold">
                Every available lesson is complete.
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">
                {backendError ||
                  "AIko will prepare another level-matched lesson when new content is available."}
              </p>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" ||
    level === "N4" ||
    level === "N3" ||
    level === "N2" ||
    level === "N1"
    ? level
    : "N5";
}
