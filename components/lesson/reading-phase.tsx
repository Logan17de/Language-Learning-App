"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Mic2, Pause, Play, RotateCcw, Square, Waves } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, ReadingEvent } from "@/types/lesson-session";
import { createReadingEvent, createStopEvent } from "@/lib/reading-event-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReadingPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const expectedPhrases = useMemo(
    () => lesson.readingConversation.map((line) => line.japanese).filter(Boolean),
    [lesson.readingConversation],
  );
  const supportItems = useMemo(() => readingSupportItems(lesson), [lesson]);
  const [started, setStarted] = useState(
    session.readingComplete || session.readingEvents.some((event) => event.type === "started"),
  );
  const [active, setActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [retryComplete, setRetryComplete] = useState(
    session.readingEvents.some((event) => event.type === "successful-retry"),
  );

  useEffect(() => {
    if (!active || paused) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        setHighlightedIndex(
          Math.min(Math.max(0, expectedPhrases.length - 1), Math.floor(next / 3)),
        );
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, expectedPhrases.length, paused]);

  const revealed = useMemo(() => {
    const map = new Map<string, number>();
    session.readingEvents
      .filter((event) => event.type === "reading-revealed" || event.type === "meaning-revealed")
      .forEach((event) => map.set(event.term, (map.get(event.term) ?? 0) + 1));
    return map;
  }, [session.readingEvents]);

  function start() {
    setStarted(true);
    setActive(true);
    setPaused(false);
    if (!session.readingEvents.some((event) => event.type === "started")) {
      onChange({
        ...session,
        readingEvents: [...session.readingEvents, createReadingEvent("started", "reading-session", seconds)],
      });
    }
  }

  function stop() {
    setActive(false);
    const stopEvent = createStopEvent(expectedPhrases, highlightedIndex, seconds, session.readingEvents);
    onChange({
      ...session,
      readingEvents: stopEvent
        ? mergeEvents(session.readingEvents, [stopEvent])
        : session.readingEvents,
      readingComplete: true,
    });
  }

  function reveal(term: ReadingSupportItem) {
    const count = revealed.get(term.term) ?? 0;
    const type =
      term.hasKanji && count === 0 ? "reading-revealed" : "meaning-revealed";
    const event = createReadingEvent(type, term.term, seconds, count);
    onChange({ ...session, readingEvents: [...session.readingEvents, event] });
  }

  function retry() {
    const retryTerm =
      session.readingEvents.findLast((event) => event.type === "stopped-at-word")
        ?.term ?? expectedPhrases.at(-1);
    if (!retryTerm) return;
    setRetryComplete(true);
    const event = createReadingEvent("successful-retry", retryTerm, seconds, 1);
    onChange({ ...session, readingEvents: [...session.readingEvents, event] });
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center">
        <span className="mx-auto grid size-24 place-items-center rounded-4xl bg-moss-900 text-white shadow-float"><Mic2 className="size-10" /></span>
        <Badge className="mt-8">Read-aloud practice</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">Read when you’re ready.</h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-stone-500">
          Press Start Reading and read the saved lesson passage aloud at your own pace.
        </p>
        <div className="mx-auto mt-7 max-w-lg rounded-2xl bg-persimmon-50 p-4 text-sm text-persimmon-600">
          The passage stays hidden until you start. Voice evaluation is not connected yet, so AIko records only your progress and support taps.
        </div>
        <Button type="button" onClick={start} className="mt-8 min-h-16 px-10 text-base"><Mic2 className="size-5" /> Start Reading</Button>
      </div>
    );
  }

  if (session.readingComplete && !active) {
    const difficultTerms = unique(
      session.readingEvents
        .filter((event) =>
          ["paused-before-word", "pronunciation-issue", "stopped-at-word"].includes(
            event.type,
          ),
        )
        .map((event) => event.term),
    );
    return (
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-100 text-moss-700"><Check className="size-9" /></span>
          <h2 className="mt-6 text-3xl font-semibold">Reading complete</h2>
          <p className="mt-2 text-stone-500">{seconds || session.elapsedSeconds} seconds · progress saved</p>
        </div>
        <Card className="mt-8 p-7">
          <div className="flex items-center justify-between"><h3 className="font-semibold">Words to review</h3><Badge tone="orange">Medium confidence</Badge></div>
          {difficultTerms.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {difficultTerms.map((term) => {
                const support = supportItems.find((item) => item.term === term);
                return (
              <div key={term} className="rounded-2xl bg-persimmon-50 p-4">
                <p className="font-serif text-2xl font-semibold">{term}</p>
                    {support && (
                      <p className="mt-1 text-xs text-stone-500">
                        {support.reading} · {support.meaning}
                      </p>
                    )}
              </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
              No vocabulary item was marked weak during this self-guided reading.
            </p>
          )}
          <div className="mt-5 rounded-2xl bg-moss-50 p-4 text-sm leading-6 text-moss-900">
            Stopping marks only the current phrase for review. AIko does not infer pronunciation quality without voice evaluation.
          </div>
          <Button type="button" variant={retryComplete ? "secondary" : "primary"} onClick={retry} className="mt-5">
            {retryComplete ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
            {retryComplete ? "Marked as retried" : "Retry marked phrase"}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><Badge tone="orange">Reading aloud</Badge><h2 className="mt-3 text-3xl font-semibold">{lesson.japaneseTitle}</h2></div>
        <div className="flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm">
          <Clock3 className="size-4 text-moss-600" /> {formatTime(seconds)}
          <span className={cn("ml-1 size-2 rounded-full", active && !paused ? "animate-pulse bg-persimmon-500" : "bg-stone-300")} />
        </div>
      </div>

      <Card className="mt-7 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-moss-900 p-4 text-white">
          <div className="flex items-center gap-3"><Waves className={cn("size-5", active && !paused && "animate-pulse")} /><span className="text-sm font-semibold">{paused ? "Reading paused" : "Listening for your reading…"}</span></div>
          <span className="text-xs text-white/50">Timer only · no recording</span>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          {lesson.readingConversation.map((line, lineIndex) => (
            <div key={`${line.speaker}-${lineIndex}`} className="grid gap-3 sm:grid-cols-[5rem_1fr]">
              <p className="text-sm font-semibold text-moss-700">{line.speaker}</p>
              <p className="font-serif text-xl leading-9">{line.japanese}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-5" aria-label="Expected phrase progression">
            {expectedPhrases.map((phrase, index) => (
              <span key={phrase} className={cn("rounded-lg px-2 py-1 text-xs transition", index < highlightedIndex ? "bg-moss-100 text-moss-700" : index === highlightedIndex ? "bg-persimmon-100 font-semibold text-persimmon-600 ring-2 ring-persimmon-300" : "bg-stone-50 text-stone-400")}>{phrase}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {supportItems.map((support) => {
              const count = revealed.get(support.term) ?? 0;
              return (
                <button key={support.term} type="button" onClick={() => reveal(support)} className="min-h-11 rounded-xl bg-moss-50 px-4 text-sm focus:outline-none focus:ring-4 focus:ring-moss-100">
                  <span className="font-semibold">{support.term}</span>
                  {support.hasKanji && count >= 1 && <span className="ml-2 text-moss-600">{support.reading}</span>}
                  {count >= (support.hasKanji ? 2 : 1) && <span className="ml-2 text-stone-500">· {support.meaning}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        {active ? (
          <Button type="button" variant="secondary" onClick={() => setPaused((value) => !value)}>
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />} {paused ? "Resume" : "Pause"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={start}><Play className="size-4" /> Resume Reading</Button>
        )}
        <Button type="button" onClick={stop} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop Reading</Button>
      </div>
    </div>
  );
}

function mergeEvents(existing: ReadingEvent[], additions: ReadingEvent[]): ReadingEvent[] {
  const ids = new Set(existing.map((event) => `${event.type}_${event.term}`));
  return [...existing, ...additions.filter((event) => !ids.has(`${event.type}_${event.term}`))];
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

interface ReadingSupportItem {
  term: string;
  reading: string;
  meaning: string;
  hasKanji: boolean;
}

function readingSupportItems(lesson: LessonPackage): ReadingSupportItem[] {
  const passage = lesson.readingConversation.map((line) => line.japanese).join("");
  const candidates = [
    ...lesson.vocabulary.map((item) => ({
      term: item.term,
      reading: item.reading,
      meaning: item.meaning,
    })),
    ...lesson.kanji.map((item) => ({
      term: item.character,
      reading: item.reading,
      meaning: item.meaning,
    })),
  ];
  const seen = new Set<string>();
  return candidates
    .filter((item) => item.term && passage.includes(item.term))
    .filter((item) => {
      if (seen.has(item.term)) return false;
      seen.add(item.term);
      return true;
    })
    .map((item) => ({
      ...item,
      hasKanji: /[\u3400-\u9fff]/u.test(item.term),
    }))
    .slice(0, 8);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
