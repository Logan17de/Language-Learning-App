"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { StoryWord } from "@/types/lesson";
import { cn } from "@/lib/utils";

type RevealType = "reading" | "meaning";

type ActiveTerm = {
  word: StoryWord;
  key: string;
  x: number;
  y: number;
  above: boolean;
};

export function InspectableText({
  text,
  terms,
  className,
  onReveal,
}: {
  text: string;
  terms: StoryWord[];
  className?: string;
  onReveal?: (word: StoryWord, reveal: RevealType) => void;
  showAudio?: boolean;
}) {
  const supportRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState<ActiveTerm | null>(null);
  const [closing, setClosing] = useState(false);
  const [stages, setStages] = useState<Record<string, number>>({});
  const segments = useMemo(() => segmentText(text, terms), [terms, text]);

  const dismiss = useCallback(() => {
    if (!active || closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      setActive(null);
      setClosing(false);
      timerRef.current = null;
    }, 140);
  }, [active, closing]);

  useEffect(() => {
    if (!active) return;
    const pointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || supportRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-inspectable-trigger]")) return;
      dismiss();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [active, dismiss]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  function inspect(word: StoryWord, key: string, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const current = stages[key] ?? 0;
    const next = word.scriptType === "kanji" && current === 0 ? 1 : 2;
    const fullyVisible = current >= 2;
    if (fullyVisible && active?.key === key) {
      dismiss();
      return;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setClosing(false);
    setStages((value) => ({ ...value, [key]: Math.max(value[key] ?? 0, next) }));
    setActive({
      word,
      key,
      x: Math.max(152, Math.min(window.innerWidth - 152, rect.left + rect.width / 2)),
      y: rect.bottom + 12,
      above: rect.bottom + 190 > window.innerHeight && rect.top > 190,
    });
    onReveal?.(word, next === 1 ? "reading" : "meaning");
  }

  const stage = active ? stages[active.key] ?? 0 : 0;
  const popup = active && typeof document !== "undefined" ? createPortal(
    <div
      ref={supportRef}
      role="dialog"
      aria-label={`Help for ${active.word.surface}`}
      className={cn(
        "fixed z-[70] w-72 overflow-visible rounded-2xl border border-moss-700 bg-moss-900 text-white shadow-2xl transition duration-150",
        closing ? "scale-95 opacity-0" : "scale-100 opacity-100",
      )}
      style={{
        left: active.x,
        top: active.above ? active.y - 24 : active.y,
        transform: active.above ? "translate(-50%, -100%)" : "translateX(-50%)",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <span className={cn("absolute left-1/2 size-4 -translate-x-1/2 rotate-45 border-moss-700 bg-moss-900", active.above ? "-bottom-2 border-b border-r" : "-top-2 border-l border-t")} aria-hidden="true" />
      {active.word.scriptType === "kanji" && stage >= 1 && (
        <div className="border-b border-white/15 px-5 py-3 text-center text-lg font-semibold text-persimmon-200">{active.word.reading}</div>
      )}
      {stage >= 2 && (
        <div className="px-5 py-4 text-center text-lg font-medium">{active.word.meaning}</div>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        typeof segment === "string" ? (
          <span key={`text-${index}`}>{segment}</span>
        ) : (
          <span
            key={segment.key}
            role="button"
            tabIndex={0}
            data-inspectable-trigger
            className="cursor-help border-b-2 border-dotted border-stone-300 transition hover:border-moss-500 focus:outline-none focus:ring-2 focus:ring-moss-200"
            aria-label={`Get help with ${segment.word.surface}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              inspect(segment.word, segment.key, event.currentTarget);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              inspect(segment.word, segment.key, event.currentTarget);
            }}
          >
            {segment.text}
          </span>
        ),
      )}
      {popup}
    </span>
  );
}

type Segment = string | { text: string; word: StoryWord; key: string };

function segmentText(text: string, source: StoryWord[]): Segment[] {
  const terms = source
    .filter((item) => item.surface && text.includes(item.surface))
    .filter((item, index, all) => all.findIndex((value) => value.surface === item.surface) === index)
    .sort((left, right) => right.surface.length - left.surface.length);
  if (!terms.length) return [text];
  const result: Segment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let bestIndex = -1;
    let best: StoryWord | null = null;
    for (const term of terms) {
      const index = text.indexOf(term.surface, cursor);
      if (index < 0) continue;
      if (bestIndex < 0 || index < bestIndex || (index === bestIndex && term.surface.length > (best?.surface.length ?? 0))) {
        bestIndex = index;
        best = term;
      }
    }
    if (!best || bestIndex < 0) {
      result.push(text.slice(cursor));
      break;
    }
    if (bestIndex > cursor) result.push(text.slice(cursor, bestIndex));
    result.push({
      text: best.surface,
      word: best,
      key: `${best.id}:${bestIndex}`,
    });
    cursor = bestIndex + best.surface.length;
  }
  return result;
}
