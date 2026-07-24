"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, CheckCircle2, Crown, Route, Sparkles } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { learnerVisibleLessons, mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { buildLessonCardStates } from "@/lib/lesson-search-utils";
import { selectNextLesson } from "@/lib/lesson-assignment";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { LessonCard } from "@/components/learn/lesson-card";
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
  const completedIds = useAppStore((state) => state.progress.completedLessonIds);
  const recentLessons = useAppStore((state) => state.progress.recentLessons);
  const sessions = useAppStore((state) => state.lessonSessions);
  const onboarding = useAppStore((state) => state.onboarding);
  const subscription = useAppStore((state) => state.subscription);
  const user = useAppStore((state) => state.user);
  const backendMode = getBackendMode();
  const premium = subscription.plan === "premium";

  const allDemoLessons = useMemo(
    () => learnerVisibleLessons(mergeCanonicalLessons(mockLessons, generated, overrides, deletedLessonIds)),
    [deletedLessonIds, generated, overrides],
  );
  const assigned = useMemo(() => {
    if (backendMode === "supabase") {
      return backendLessons[0] ? { lesson: backendLessons[0], mode: premium ? "pro_interest" as const : "free_random" as const, interestMatches: [] } : null;
    }
    const activeLesson = allDemoLessons.find((lesson) => sessions[lesson.id] && !sessions[lesson.id].completed);
    if (activeLesson) return { lesson: activeLesson, mode: premium ? "pro_interest" as const : "free_random" as const, interestMatches: [] };
    return selectNextLesson({
      lessons: allDemoLessons,
      level: learnerLevel(onboarding.level ?? user.level),
      interests: onboarding.interests,
      premium,
      excludedLessonIds: completedIds,
      seed: `${user.id}:${completedIds.length}`,
    });
  }, [allDemoLessons, backendLessons, backendMode, completedIds, onboarding.interests, onboarding.level, premium, sessions, user.id, user.level]);
  const card = assigned
    ? buildLessonCardStates([assigned.lesson], [], completedIds, sessions, recentLessons)[0]
    : null;

  useEffect(() => {
    void loadBackendLessons();
    const timer = window.setTimeout(() => setDemoLoading(false), 320);
    return () => window.clearTimeout(timer);
  }, [loadBackendLessons]);

  const loading = backendLoading || (backendMode === "demo" && demoLoading);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-kicker">Your learning path</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">One right-sized lesson at a time.</h1>
          <p className="mt-3 max-w-2xl leading-7 text-stone-500">AIko selects what comes next from your level and learning history. Assigned lessons never repeat.</p>
        </div>
        {premium && <ButtonLink href="/custom-topic" variant="secondary"><Sparkles className="size-4 text-persimmon-500" /> Create from my topic</ButtonLink>}
      </header>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-stone-400">Assigned now</p>
              <p className="mt-1 text-sm text-stone-500">{premium ? "Matched to your level and interests" : "Randomly selected at your level"}</p>
            </div>
            <span className="rounded-full bg-moss-100 px-3 py-1.5 text-xs font-bold text-moss-700">{learnerLevel(onboarding.level ?? user.level)}</span>
          </div>
          {loading ? (
            <div className="h-[28rem] animate-pulse rounded-3xl bg-moss-50" aria-label="Selecting your next lesson" />
          ) : card ? (
            <LessonCard state={card} />
          ) : (
            <Card className="grid min-h-[24rem] place-items-center border-dashed text-center">
              <div>
                <CheckCircle2 className="mx-auto size-10 text-moss-500" />
                <h2 className="mt-5 text-xl font-semibold">You finished every available lesson at this level.</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">{backendError || "AIko will offer another lesson as soon as more level-matched content is published."}</p>
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card className="!bg-moss-900 p-6 text-white">
            <Route className="size-6 text-persimmon-400" />
            <h2 className="mt-5 text-xl font-semibold">Why this lesson?</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {premium
                ? assigned?.interestMatches.length
                  ? `It matches ${assigned.interestMatches.join(", ")} and your current level.`
                  : "It fits your current level; AIko also considered your profile interests."
                : "Free lessons are chosen randomly from your current level. Interests do not influence the selection."}
            </p>
          </Card>
          <Card className="p-6">
            <BrainCircuit className="size-6 text-moss-600" />
            <h2 className="mt-5 text-lg font-semibold">The path learns with you</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">Answers, retries, reveals, listening, and review results shape your strengths and weaknesses. You do not need to manage or star lessons.</p>
          </Card>
          {!premium && (
            <Card className="p-6">
              <Crown className="size-6 text-persimmon-500" />
              <h2 className="mt-5 text-lg font-semibold">Want a topic of your own?</h2>
              <p className="mt-2 text-sm leading-6 text-stone-500">Pro can turn a topic plus your interests into a full level-matched lesson.</p>
              <ButtonLink href="/subscription" variant="secondary" className="mt-5 w-full">Explore Pro</ButtonLink>
            </Card>
          )}
        </aside>
      </section>
    </div>
  );
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" || level === "N4" || level === "N3" || level === "N2" || level === "N1" ? level : "N5";
}
