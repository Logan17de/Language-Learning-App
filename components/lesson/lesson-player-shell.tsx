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
    <div className="min-h-dvh bg-paper text-ink">
      <a
        href="#lesson-content"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-full bg-moss-900 px-4 py-3 text-sm font-semibold text-white shadow-float transition-transform duration-180 focus:translate-y-0"
      >
        Skip to lesson content
      </a>
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-20 sm:px-8">
          <button type="button" onClick={onExit} aria-label="Pause or exit lesson" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted"><X className="size-5" aria-hidden="true" /></button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-xs text-muted">{lessonTitle}</p>
            <p className="truncate text-sm font-semibold">{phaseName}</p>
          </div>
          <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-2xl border border-border bg-surface-muted text-xs" aria-label={`Phase ${phaseNumber} of ${totalPhases}`}>
            <span className="font-bold text-moss-700">{phaseNumber}</span>
            <span className="text-[9px] text-muted">of {totalPhases}</span>
          </div>
        </div>
        <ProgressBar value={progress} className="h-1 rounded-none bg-surface-muted" />
      </header>

      <main id="lesson-content" className="mx-auto max-w-6xl px-5 py-8 pb-32 sm:px-8 sm:py-12 sm:pb-36">
        {children}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
          <Button type="button" variant="ghost" onClick={onBack} className="px-4">
            <ArrowLeft className="size-4" aria-hidden="true" /> Back
          </Button>
          <Button type="button" onClick={onContinue} disabled={!canContinue} className="min-w-40">
            {continueLabel} <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
