"use client";

import { ArrowRight, Flame, Gem, Target } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { progressRepository } from "@/lib/repositories/progress-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import { useBackendProgressStore } from "@/store/backend-progress-store";

export function HomeDashboard() {
  const backendMode = getBackendMode();
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const hydrateBackendProgress = useAppStore(
    (state) => state.hydrateBackendProgress,
  );

  const progressOwnerUserId = useBackendProgressStore(
    (state) => state.ownerUserId,
  );
  const backendProgressStatus = useBackendProgressStore(
    (state) => state.status,
  );
  const backendProgressError = useBackendProgressStore((state) => state.error);
  const completedLessonCount = useBackendProgressStore(
    (state) => state.completedLessonCount,
  );

  const progressReady =
    backendMode !== "supabase" ||
    (progressOwnerUserId === user.id && backendProgressStatus === "ready");
  const progressFailed =
    backendMode === "supabase" &&
    progressOwnerUserId === user.id &&
    backendProgressStatus === "error";
  const authoritativeLessonCount =
    backendMode === "supabase"
      ? completedLessonCount
      : progress.completedLessonIds.length;

  async function retryProgress() {
    if (!user.id) return;
    const userId = user.id;
    useBackendProgressStore.getState().begin(userId, true);
    const result = await progressRepository.loadCurrent();

    const accountStillCurrent =
      useBackendProgressStore.getState().ownerUserId === userId &&
      useAppStore.getState().user.id === userId;
    if (!accountStillCurrent) return;

    if (!result.ok) {
      useBackendProgressStore
        .getState()
        .fail(userId, result.error.message, true);
      return;
    }

    hydrateBackendProgress(result.data);
    useBackendProgressStore
      .getState()
      .succeed(userId, result.data.completedLessonCount);
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-9 lg:py-10">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="section-kicker">Today</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {user.name}.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted sm:text-base">
            Pick something you want to learn through today. AIko turns your
            topic into one connected Japanese lesson at your level.
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
              <Badge tone="orange">Create your lesson</Badge>
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70">
                6 connected phases
              </span>
            </div>

            <h2 className="mt-7 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              What do you want to learn through today?
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              Choose a topic and Japanese level on Learn. AIko builds a story,
              vocabulary, grammar, reading, listening, and speaking around the
              language you actually asked for.
            </p>

            <div className="mt-7 flex flex-wrap gap-2 text-xs font-medium text-white/65">
              <span className="rounded-full bg-white/[0.07] px-3 py-2">
                Your topic
              </span>
              <span className="rounded-full bg-white/[0.07] px-3 py-2">
                Your level
              </span>
              <span className="rounded-full bg-white/[0.07] px-3 py-2">
                Resume anytime
              </span>
            </div>

            <ButtonLink
              href="/learn"
              className="mt-8 !bg-persimmon-500 px-7 hover:!bg-persimmon-600"
            >
              Create or resume a lesson
              <ArrowRight
                className="size-4 transition-transform duration-180 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </ButtonLink>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          {progressReady ? (
            <>
              <Card className="p-5 sm:p-6">
                <span className="grid size-10 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
                  <Flame className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-3xl font-semibold tabular-nums">
                  {user.streakDays}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">day streak</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Complete at least one lesson on consecutive days to keep your
                  streak alive.
                </p>
              </Card>

              <Card className="p-5 sm:p-6">
                <span className="grid size-10 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                  <Gem className="size-5" aria-hidden="true" />
                </span>
                <p className="mt-5 text-3xl font-semibold tabular-nums">
                  {user.xp.toLocaleString()}
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">total XP</p>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Each completed lesson earns 50 base XP plus your lesson score,
                  up to 150 XP.
                </p>
              </Card>
            </>
          ) : (
            <Card
              className="col-span-2 p-5 sm:p-6 lg:col-span-1"
              role={progressFailed ? "alert" : "status"}
              aria-live="polite"
            >
              <span className="grid size-10 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                <Gem className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-5 text-lg font-semibold">
                {progressFailed ? "Progress unavailable" : "Loading your progress"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                {progressFailed
                  ? backendProgressError ||
                    "AIko couldn’t load your progress from the server."
                  : "Your XP and streak will appear once the server confirms the latest values."}
              </p>
              {progressFailed && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void retryProgress()}
                  className="mt-4"
                >
                  Retry progress
                </Button>
              )}
            </Card>
          )}
        </div>
      </section>

      <section className="mt-5">
        <Card
          className="p-6 sm:p-7"
          role={!progressReady ? (progressFailed ? "alert" : "status") : undefined}
          aria-live={!progressReady ? "polite" : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
              <Target className="size-5" aria-hidden="true" />
            </span>
            {progressReady && (
              <span className="text-sm font-semibold tabular-nums text-moss-700">
                {progress.levelCompletion}%
              </span>
            )}
          </div>
          <h2 className="mt-6 text-xl font-semibold">Your learning progress</h2>
          {progressReady ? (
            <>
              <p className="mt-2 text-sm leading-6 text-muted">
                Mastery updates automatically from your answers, listening,
                reading, and speaking activity across lessons.
              </p>
              <ProgressBar
                value={progress.levelCompletion}
                className="mt-5"
                aria-label="Learning progress"
              />
              <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                <MiniStat
                  value={progress.learnedVocabularyCount}
                  label="vocabulary"
                />
                <MiniStat value={progress.learnedGrammarCount} label="grammar" />
                <MiniStat
                  value={authoritativeLessonCount ?? 0}
                  label="lessons"
                />
              </div>
              <ButtonLink
                href="/progress"
                variant="secondary"
                className="mt-5 w-full sm:w-auto"
              >
                See my progress
              </ButtonLink>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm leading-6 text-muted">
                {progressFailed
                  ? "These stats are hidden because the latest backend progress could not be verified."
                  : "Waiting for the server to confirm your mastery and completion totals."}
              </p>
              {progressFailed && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void retryProgress()}
                  className="mt-5"
                >
                  Retry progress
                </Button>
              )}
            </>
          )}
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
