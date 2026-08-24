"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface MasteryBand {
  key: string;
  label: string;
  before: number;
  after: number;
}

/**
 * What the lesson moved, one measure at a time.
 *
 * Each bar fills first to where the learner already stood, then extends into
 * the part this lesson added — so the gain reads as something built on top of
 * existing ground rather than as a number that simply appeared. A measure that
 * fell shows the same way in reverse: the bar settles back from where it was,
 * because a lesson can weaken an item as well as strengthen one.
 *
 * The bands run in order and the last one is the overall figure, so the sequence
 * ends on the number that summarises the rest.
 */
export function MasteryProgress({
  bands,
  className,
}: {
  bands: MasteryBand[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      {bands.map((band, index) => (
        <MasteryBar
          key={band.key}
          band={band}
          // Each bar waits for the one above it to have said its piece.
          delayMs={index * 620}
          emphasised={index === bands.length - 1}
        />
      ))}
    </div>
  );
}

function MasteryBar({
  band,
  delayMs,
  emphasised,
}: {
  band: MasteryBand;
  delayMs: number;
  emphasised: boolean;
}) {
  // Three stages: nothing, the ground the learner already held, then the change.
  const [stage, setStage] = useState<0 | 1 | 2>(0);

  useEffect(() => {
    const toGround = window.setTimeout(() => setStage(1), delayMs + 40);
    const toChange = window.setTimeout(() => setStage(2), delayMs + 460);
    return () => {
      window.clearTimeout(toGround);
      window.clearTimeout(toChange);
    };
  }, [delayMs]);

  const delta = band.after - band.before;
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const ground = clamp(Math.min(band.before, band.after));
  const changeWidth = clamp(Math.abs(delta));

  const groundWidth = stage === 0 ? 0 : ground;
  const showChange = stage === 2 && delta !== 0;
  const rose = delta > 0;

  const value = useMemo(
    () => (stage === 2 ? band.after : stage === 1 ? band.before : 0),
    [stage, band.after, band.before],
  );

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span
          className={cn(
            "text-sm",
            emphasised ? "font-semibold text-ink" : "font-medium text-ink",
          )}
        >
          {band.label}
        </span>
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "tabular-nums font-semibold",
              emphasised ? "text-lg text-ink" : "text-sm text-muted",
            )}
          >
            {value}%
          </span>
          {delta !== 0 && (
            <span
              className={cn(
                "tabular-nums text-xs font-bold transition-opacity duration-300",
                showChange ? "opacity-100" : "opacity-0",
                rose ? "text-moss-700" : "text-persimmon-600",
              )}
            >
              {rose ? "+" : "−"}
              {Math.abs(delta)}
            </span>
          )}
        </span>
      </div>

      <div
        className={cn(
          "flex overflow-hidden rounded-full bg-surface-muted",
          emphasised ? "h-3" : "h-2",
        )}
        role="progressbar"
        aria-label={`${band.label} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamp(band.after)}
      >
        {/* Where the learner already stood. */}
        <div
          className="h-full bg-moss-600 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${groundWidth}%` }}
        />
        {/* What this lesson added, or gave back. */}
        <div
          className={cn(
            "h-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
            rose ? "bg-persimmon-400" : "bg-persimmon-200",
          )}
          style={{ width: showChange ? `${changeWidth}%` : "0%" }}
        />
      </div>
    </div>
  );
}
