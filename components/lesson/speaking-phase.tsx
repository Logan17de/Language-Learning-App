"use client";

import { useState } from "react";
import { Mic2, Play, RotateCcw, Square } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, SpeakingEvent } from "@/types/lesson-session";
import { SpeakingFeedback } from "@/components/exercises/speaking-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SpeakingMode = "easy" | "medium" | "hard";

export function SpeakingPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const [mode, setMode] = useState<SpeakingMode>(session.speakingEvents.at(-1)?.mode ?? "medium");
  const [speaking, setSpeaking] = useState(false);
  const [examplePlaying, setExamplePlaying] = useState(false);
  const latest = session.speakingEvents.at(-1);
  const modelAnswer = lesson.speakingExercises[0].modelAnswer;

  function stop() {
    setSpeaking(false);
    const attempt = session.speakingEvents.length + 1;
    const retry = attempt > 1;
    const event: SpeakingEvent = {
      id: `speaking_${attempt}`,
      mode,
      attempt,
      pronunciationConfidence: retry ? 89 : mode === "hard" ? 74 : 82,
      grammarAccuracy: retry ? 94 : 86,
      recognizedWords: ["音楽", "聞きながら", "会社", "行きます"],
      missedWords: retry ? [] : ["へ"],
      successfulRetry: retry,
    };
    onChange({ ...session, speakingEvents: [...session.speakingEvents, event], speakingComplete: true });
  }

  function playExample() {
    setExamplePlaying(true);
    window.setTimeout(() => setExamplePlaying(false), 1800);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge tone="orange">Output practice</Badge>
        <h2 className="mt-4 text-3xl font-semibold">Say it your way.</h2>
        <p className="mt-3 text-stone-500">Choose how much support you want. Evaluation is simulated locally.</p>
      </div>
      <div className="mt-7 grid grid-cols-3 rounded-2xl bg-stone-100 p-1" role="tablist" aria-label="Speaking difficulty">
        {(["easy", "medium", "hard"] as SpeakingMode[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)} className={cn("min-h-11 rounded-xl text-sm font-semibold capitalize transition focus:outline-none focus:ring-4 focus:ring-moss-100", mode === item ? "bg-white text-moss-700 shadow-sm" : "text-stone-500")}>{item}</button>
        ))}
      </div>

      <Card className="mt-5 p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-500">Say what you do while commuting.</p>
        <div className="mt-5 min-h-28 rounded-3xl bg-moss-50 p-6 text-center">
          {mode === "easy" && <p className="font-serif text-2xl leading-10">{modelAnswer}</p>}
          {mode === "medium" && <p className="font-serif text-2xl leading-10">音楽を ________、会社へ行きます。</p>}
          {mode === "hard" && <><p className="text-sm font-semibold text-moss-700">通勤中に何をしますか。</p><p className="mt-2 text-xs text-stone-500">What do you do during your commute?</p></>}
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" variant="secondary" onClick={playExample}><Play className={cn("size-4", examplePlaying && "animate-pulse")} /> {examplePlaying ? "Playing…" : "Play Example"}</Button>
          {!speaking ? (
            <Button type="button" onClick={() => setSpeaking(true)}><Mic2 className="size-4" /> Start Speaking</Button>
          ) : (
            <Button type="button" onClick={stop} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop</Button>
          )}
        </div>
        {speaking && (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm font-semibold text-persimmon-600" role="status">
            <span className="size-3 animate-pulse rounded-full bg-persimmon-500" /> Mock microphone active…
          </div>
        )}
        {latest && (
          <div className="mt-7">
            <SpeakingFeedback event={latest} />
            <Button type="button" variant="secondary" className="mt-4" onClick={() => setSpeaking(true)}><RotateCcw className="size-4" /> Try Again</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
