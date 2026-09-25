"use client";

import type { CSSProperties } from "react";
import { Target } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import type { JLPTLevel } from "@/types/lesson";

const levels: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

export function ProgressDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const currentLevel = levels.includes(user.level as JLPTLevel)
    ? (user.level as JLPTLevel)
    : "N5";

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <p className="section-kicker">Progress</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          See what’s becoming familiar.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
          AIko records mastery while you work through lessons. This page turns that activity into a simple view of how far you’ve moved through {currentLevel}.
        </p>
      </header>

      <Card className="mt-8 p-6 sm:p-9">
        <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
          <Ring value={progress.levelCompletion} label={currentLevel} />
          <div>
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                <Target className="size-5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-2xl font-semibold">Your {currentLevel} learning progress</h2>
                <p className="mt-1 text-sm tabular-nums text-muted">
                  {progress.levelCompletion}% of this level completed
                </p>
              </div>
            </div>
            <ProgressBar value={progress.levelCompletion} className="mt-6" />
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <LearnedStat
                value={progress.learnedVocabularyCount}
                label="vocabulary learned"
              />
              <LearnedStat value={progress.learnedKanjiCount} label="kanji learned" />
              <LearnedStat
                value={progress.learnedGrammarCount}
                label="grammar patterns learned"
              />
            </div>
            <div className="mt-6 rounded-2xl border border-moss-100 bg-moss-50/70 px-4 py-3 text-sm leading-6 text-moss-800">
              You don’t need to maintain a separate review list. Evidence from completed lesson activities updates mastery in the background and helps AIko decide what needs more attention later.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LearnedStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-surface-muted p-4">
      <p className="text-3xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted">{label}</p>
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const ringStyle = {
    "--progress-angle": `${clampedValue * 3.6}deg`,
  } as CSSProperties;

  return (
    <div
      className="progress-ring mx-auto grid size-40 place-items-center rounded-full p-2 shadow-soft"
      style={ringStyle}
      role="img"
      aria-label={`${label} curriculum ${clampedValue}% complete`}
    >
      <div className="grid size-full place-items-center rounded-full bg-surface text-center shadow-soft">
        <span>
          <strong className="block text-3xl font-semibold tabular-nums">
            {clampedValue}%
          </strong>
          <span className="mt-1 block text-xs font-semibold text-muted">{label}</span>
        </span>
      </div>
    </div>
  );
}
