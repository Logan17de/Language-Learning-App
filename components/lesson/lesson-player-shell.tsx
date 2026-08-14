"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export function LessonPlayerShell({
  lessonTitle,
  phaseName,
  phaseNumber,
  totalPhases,
  progress,
  canContinue,
  continueLabel,
  onBack,
  onContinue,
  onExit,
  children,
}: {
  lessonTitle: string;
  phaseName: string;
  phaseNumber: number;
  totalPhases: number;
  progress: number;
  canContinue: boolean;
  continueLabel: string;
  onBack: () => void;
  onContinue: () => void;
  onExit: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-paper before:pointer-events-none before:fixed before:inset-0 before:bg-[linear-gradient(rgb(var(--aiko-paper)/.93),rgb(var(--aiko-paper)/.98)),url('/images/aiko-world-map.png')] before:bg-cover before:bg-center before:opacity-40">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 shadow-soft backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:px-8">
          <button type="button" onClick={onExit} aria-label="Exit lesson" className="grid size-11 shrink-0 place-items-center rounded-full text-stone-500 hover:bg-white focus:outline-none focus:ring-4 focus:ring-moss-100"><X className="size-5" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[10px] font-bold uppercase tracking-[.18em] text-persimmon-600">{lessonTitle}</p>
            <p className="truncate font-serif text-lg font-semibold">{phaseName}</p>
          </div>
          <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl bg-white text-xs shadow-sm" aria-label={`Phase ${phaseNumber} of ${totalPhases}`}>
            <span className="font-bold text-moss-700">{phaseNumber}</span>
            <span className="text-[9px] text-stone-400">of {totalPhases}</span>
          </div>
        </div>
        <ProgressBar value={progress} className="h-1 rounded-none bg-sand" />
      </header>

      <main className="relative mx-auto max-w-6xl animate-fade-up px-5 py-8 pb-32 sm:px-8 sm:py-12 sm:pb-36">
        {children}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-16px_40px_-32px_rgba(37,51,37,.7)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <Button type="button" variant="ghost" onClick={onBack} className="px-4">
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button type="button" onClick={onContinue} disabled={!canContinue} className="min-w-40">
            {continueLabel} <ArrowRight className="size-4" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
