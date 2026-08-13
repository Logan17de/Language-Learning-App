"use client";

import { ArrowRight, Clock3, Flame, Gem, Target } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useAppStore } from "@/store/app-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";

export function HomeDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const sessions = useAppStore((state) => state.lessonSessions);
  const backendLessons = useBackendLessonStore((state) => state.lessons);
  const backendLoading = useBackendLessonStore((state) => state.loading);
  const backendError = useBackendLessonStore((state) => state.error);
  const loadBackendLessons = useBackendLessonStore((state) => state.load);

  useEffect(() => {
    void loadBackendLessons();
  }, [loadBackendLessons]);

  const activeSession = Object.values(sessions).find(
    (session) =>
      !session.completed &&
      backendLessons.some((lesson) => lesson.id === session.lessonId),
  );
  const activeLesson = activeSession
    ? backendLessons.find((lesson) => lesson.id === activeSession.lessonId)
    : undefined;
  const nextLesson =
    backendLessons.find(
      (lesson) => !progress.completedLessonIds.includes(lesson.id),
    ) ?? backendLessons[0];
  const selectedLesson = activeLesson ?? nextLesson;
  const selectedLessonId = activeSession?.lessonId ?? selectedLesson?.id;
  const lessonPercent = selectedLessonId
    ? progress.lessonProgress[selectedLessonId] ?? 0
    : 0;
  const phaseLabel =
    activeSession && activeLesson
      ? activeLesson.phases[activeSession.currentPhaseIndex]?.label
      : undefined;
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
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            おはよう, {user.name}.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Continue your lesson and keep building useful Japanese at your current level.
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

      <section className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]">
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
              {activeSession
                ? "Resume where you stopped."
                : "Your next lesson is ready."}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              {!selectedLesson
                ? backendLoading
                  ? "Selecting a level-matched lesson for you."
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
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Story first
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Speaking included
                </span>
                <span className="rounded-full bg-white/[0.07] px-3 py-2">
                  Mastery tracked
                </span>
              </div>
            )}

            <ButtonLink
              href={
                selectedLessonId ? `/lesson/${selectedLessonId}/play` : "/learn"
              }
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

      <section className="mt-5">
        <Card className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
              <Target className="size-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold tabular-nums text-moss-700">
              {user.level} · {progress.levelCompletion}%
            </span>
          </div>
          <h2 className="mt-6 text-xl font-semibold">Level progress</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            See how much useful language you have accumulated at this level.
          </p>
          <ProgressBar value={progress.levelCompletion} className="mt-5" />
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <MiniStat
              value={progress.learnedVocabularyCount}
              label="vocabulary"
            />
            <MiniStat value={progress.learnedKanjiCount} label="kanji" />
            <MiniStat value={progress.learnedGrammarCount} label="grammar" />
          </div>
          <ButtonLink
            href="/progress"
            variant="secondary"
            className="mt-5 w-full sm:w-auto"
          >
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
