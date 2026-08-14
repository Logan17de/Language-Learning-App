"use client";

import {
  ArrowRight,
  Clock3,
  Flame,
  Gem,
  RotateCcw,
  Target,
} from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { mockLessons } from "@/data/mock-lessons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useAppStore } from "@/store/app-store";
import { getBackendMode } from "@/lib/supabase/config";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import { WorldJourney } from "@/components/home/world-journey";

export function HomeDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const sessions = useAppStore((state) => state.lessonSessions);
  const generatedLessons = useAppStore((state) => state.generatedLessons);
  const backendMode = getBackendMode();
  const backendLessons = useBackendLessonStore((state) => state.lessons);
  const backendLoading = useBackendLessonStore((state) => state.loading);
  const backendLoaded = useBackendLessonStore((state) => state.loaded);
  const backendError = useBackendLessonStore((state) => state.error);
  const loadBackendLessons = useBackendLessonStore((state) => state.load);

  useEffect(() => {
    if (backendMode === "supabase") void loadBackendLessons();
  }, [backendMode, loadBackendLessons]);

  const demoLessons = [
    ...generatedLessons,
    ...mockLessons.filter(
      (lesson) => !generatedLessons.some((item) => item.id === lesson.id),
    ),
  ];
  const allLessons = backendMode === "supabase" ? backendLessons : demoLessons;
  const activeSession = Object.values(sessions).find(
    (session) =>
      !session.completed &&
      allLessons.some((lesson) => lesson.id === session.lessonId),
  );
  const activeLesson = activeSession
    ? allLessons.find((lesson) => lesson.id === activeSession.lessonId)
    : undefined;
  const nextLesson =
    allLessons.find((lesson) => !progress.completedLessonIds.includes(lesson.id)) ??
    allLessons[0];
  const selectedLesson = activeLesson ?? nextLesson;
  const selectedLessonId = activeSession?.lessonId ?? selectedLesson?.id;
  const lessonPercent = selectedLessonId
    ? progress.lessonProgress[selectedLessonId] ?? 0
    : 0;
  const phaseLabel =
    activeSession && activeLesson
      ? activeLesson.phases[activeSession.currentPhaseIndex]?.label
      : undefined;

  const completedLessons = allLessons.filter((lesson) =>
    progress.completedLessonIds.includes(lesson.id),
  );
  const learnedVocabulary = new Set(
    completedLessons.flatMap((lesson) => lesson.vocabulary.map((item) => item.term)),
  ).size;
  const learnedKanji = new Set(
    completedLessons.flatMap((lesson) => lesson.kanji.map((item) => item.character)),
  ).size;
  const learnedGrammar = new Set(
    completedLessons.flatMap((lesson) => lesson.grammar.map((item) => item.pattern)),
  ).size;

  const levelLessons = allLessons.filter((lesson) => lesson.level === user.level);
  const levelProgress = levelLessons.length
    ? Math.round(
        levelLessons.reduce((total, lesson) => {
          if (progress.completedLessonIds.includes(lesson.id)) return total + 100;
          return total + (progress.lessonProgress[lesson.id] ?? 0);
        }, 0) / levelLessons.length,
      )
    : 0;

  const weakItems = progress.reviewQueue.filter(
    (item) => item.confidence < 70 || item.overdue,
  );
  const weakKanji = weakItems.filter((item) => item.type === "kanji").length;
  const weakGrammar = weakItems.filter((item) => item.type === "grammar").length;
  const weakOther = Math.max(0, weakItems.length - weakKanji - weakGrammar);
  const dailyPercent = user.dailyGoalMinutes
    ? Math.min(
        100,
        Math.round((user.minutesStudiedToday / user.dailyGoalMinutes) * 100),
      )
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-9 lg:py-10">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="section-kicker">Today</p>
            <span className="text-xs font-semibold text-muted">{user.level}</span>
          </div>
          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
            Your path is waiting, {user.name}.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Follow the lantern trail, strengthen what is fading, and carry today&apos;s Japanese into the next region.
          </p>
        </div>
        <Link
          href="/profile"
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-moss-600 font-semibold text-white shadow-soft transition duration-180 hover:bg-moss-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.98]"
          aria-label={`Open ${user.name}'s profile`}
        >
          {user.name.charAt(0).toUpperCase()}
        </Link>
      </header>

      <div className="mt-8 animate-fade-up">
        <WorldJourney progress={levelProgress} />
      </div>

      <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
        <Card className="relative overflow-hidden !border-moss-900 !bg-moss-900 p-7 text-white shadow-float sm:p-9">
          <div
            className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full border-[42px] border-white/[0.04]"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge tone="orange">Next up</Badge>
              {selectedLesson && (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70">
                  {selectedLesson.level} · 7 stages
                </span>
              )}
            </div>

            <h2 className="mt-7 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
              {activeSession ? "Resume where you stopped." : "Your next lesson is ready."}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              {backendMode === "supabase" && !selectedLesson
                ? backendLoading || !backendLoaded
                  ? "AIko is selecting a level-matched lesson for you."
                  : backendError ||
                    "No published lesson is available for your current level yet."
                : activeSession
                  ? "Your checkpoint, activity progress, and learning evidence are already saved."
                  : "The topic stays private until you begin, so the lesson starts without spoilers."}
            </p>

            {activeSession ? (
              <div className="mt-7 max-w-lg rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-2 flex justify-between gap-4 text-xs font-medium text-white/65">
                  <span>{phaseLabel ?? "Lesson in progress"}</span>
                  <span className="tabular-nums">{lessonPercent}%</span>
                </div>
                <ProgressBar
                  value={lessonPercent}
                  className="bg-white/10"
                  barClassName="bg-persimmon-400"
                />
              </div>
            ) : (
              <div className="mt-7 flex flex-wrap gap-2 text-xs font-medium text-white/65">
                <span className="rounded-full bg-white/[0.07] px-3 py-2">Story first</span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">Speaking included</span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">Adaptive review</span>
              </div>
            )}

            <ButtonLink
              href={selectedLessonId ? `/lesson/${selectedLessonId}/play` : "/learn"}
              className="mt-8 !bg-persimmon-500 px-7 hover:!bg-persimmon-600"
            >
              {backendLoading
                ? "Preparing lesson"
                : activeSession
                  ? "Resume lesson"
                  : "Start lesson"}
              <ArrowRight
                className="size-4 transition-transform duration-180 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </ButtonLink>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">Daily goal</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  A small target is easier to keep every day.
                </p>
              </div>
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                <Clock3 className="size-5" aria-hidden="true" />
              </span>
            </div>
            <div className="mt-6 flex items-end justify-between gap-4">
              <p className="text-3xl font-semibold tabular-nums">
                {user.minutesStudiedToday}
                <span className="ml-1 text-base font-medium text-muted">
                  / {user.dailyGoalMinutes} min
                </span>
              </p>
              <span className="text-sm font-semibold tabular-nums text-moss-700">
                {dailyPercent}%
              </span>
            </div>
            <ProgressBar value={dailyPercent} className="mt-3" />
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <span className="grid size-10 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
                <Flame className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-2xl font-semibold tabular-nums">
                {user.streakDays}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">day streak</p>
            </Card>
            <Card className="p-5">
              <span className="grid size-10 place-items-center rounded-2xl bg-surface-muted text-muted">
                <Gem className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-5 text-2xl font-semibold tabular-nums">
                {user.xp.toLocaleString()}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">total XP</p>
            </Card>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <RotateCcw className="size-5" aria-hidden="true" />
            </span>
            <Badge tone={weakItems.length ? "orange" : "moss"}>
              {weakItems.length} weak
            </Badge>
          </div>
          <h2 className="mt-6 text-xl font-semibold">Review what needs work</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Only language that needs another pass appears here.
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <MiniStat value={weakKanji} label="kanji" />
            <MiniStat value={weakGrammar} label="grammar" />
            <MiniStat value={weakOther} label="other" />
          </div>
          <ButtonLink href="/review" variant="secondary" className="mt-5 w-full">
            Open review
          </ButtonLink>
        </Card>

        <Card className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
              <Target className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tabular-nums text-moss-700">
              {user.level} · {levelProgress}%
            </span>
          </div>
          <h2 className="mt-6 text-xl font-semibold">Level progress</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            See how much useful language you have accumulated at this level.
          </p>
          <ProgressBar value={levelProgress} className="mt-5" />
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <MiniStat value={learnedVocabulary} label="vocabulary" />
            <MiniStat value={learnedKanji} label="kanji" />
            <MiniStat value={learnedGrammar} label="grammar" />
          </div>
          <ButtonLink href="/progress" variant="secondary" className="mt-5 w-full">
            View progress
          </ButtonLink>
        </Card>
      </section>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-surface-muted px-2 py-3">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] capitalize text-muted">{label}</p>
    </div>
  );
}
