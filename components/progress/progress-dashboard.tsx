"use client";

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
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Your {currentLevel} progress.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">
          A focused view of level completion and language you have learned.
        </p>
      </header>

      <Card className="mt-8 p-6 sm:p-9">
        <div className="grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
          <Ring value={progress.levelCompletion} label={currentLevel} />
          <div>
            <div className="flex items-center gap-3">
              <Target className="size-5 text-moss-600" />
              <div>
                <h2 className="text-2xl font-semibold">
                  {currentLevel} level completion
                </h2>
                <p className="mt-1 text-sm text-stone-400">
                  {progress.levelCompletion}% complete
                </p>
              </div>
            </div>
            <ProgressBar value={progress.levelCompletion} className="mt-6" />
            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <LearnedStat
                value={progress.learnedVocabularyCount}
                label="vocabulary learned"
              />
              <LearnedStat
                value={progress.learnedKanjiCount}
                label="kanji learned"
              />
              <LearnedStat
                value={progress.learnedGrammarCount}
                label="grammar learned"
              />
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LearnedStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-moss-50 p-4">
      <p className="text-3xl font-semibold text-moss-800">{value}</p>
      <p className="mt-1 text-xs text-stone-500">{label}</p>
    </div>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="mx-auto grid size-36 place-items-center rounded-full"
      style={{
        background: `conic-gradient(#4f8068 ${value * 3.6}deg, #e2eee7 0)`,
      }}
      role="img"
      aria-label={`${label} curriculum ${value}% complete`}
    >
      <div className="grid size-28 place-items-center rounded-full bg-white text-center">
        <span>
          <strong className="block text-3xl">{value}%</strong>
          <span className="text-xs font-semibold text-stone-400">{label}</span>
        </span>
      </div>
    </div>
  );
}
