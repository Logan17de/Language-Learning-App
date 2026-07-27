"use client";

import { useState } from "react";
import { ArrowRight, Eye, Mic2, RotateCcw, Square } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, SpeakingEvent } from "@/types/lesson-session";
import { SpeakingFeedback } from "@/components/exercises/speaking-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
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
  const exercises = lesson.speakingExercises;
  const completedIds = new Set(
    session.speakingEvents.map((event) => event.exerciseId).filter(Boolean),
  );
  const currentIndex = Math.min(session.activityIndex, exercises.length - 1);
  const exercise = exercises[currentIndex];
  const exerciseEvents = session.speakingEvents.filter(
    (event) => event.exerciseId === exercise.id,
  );
  const [mode, setMode] = useState<SpeakingMode>(
    exerciseEvents.at(-1)?.mode ?? exercise.mode,
  );
  const [speaking, setSpeaking] = useState(false);
  const [showModelAnswer, setShowModelAnswer] = useState(false);
  const latest = exerciseEvents.at(-1);

  function stop() {
    setSpeaking(false);
    const attempt = exerciseEvents.length + 1;
    const retry = attempt > 1;
    const event: SpeakingEvent = {
      id: `speaking_${exercise.id}_${attempt}`,
      exerciseId: exercise.id,
      mode,
      attempt,
      evaluationAvailable: false,
      pronunciationConfidence: 0,
      grammarAccuracy: 0,
      recognizedWords: [],
      missedWords: [],
      successfulRetry: retry,
    };
    const completedAfter = new Set([...completedIds, exercise.id]);
    onChange({
      ...session,
      activityIndex: currentIndex,
      speakingEvents: [...session.speakingEvents, event],
      speakingComplete: exercises.every((item) => completedAfter.has(item.id)),
    });
  }

  function nextExercise() {
    if (!latest || currentIndex >= exercises.length - 1) return;
    setSpeaking(false);
    setShowModelAnswer(false);
    setMode(exercises[currentIndex + 1].mode);
    onChange({ ...session, activityIndex: currentIndex + 1 });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <Badge tone="orange">Output practice</Badge>
        <h2 className="mt-4 text-3xl font-semibold">Say it your way.</h2>
        <p className="mt-3 text-stone-500">Choose how much support you want. Voice evaluation will be added later.</p>
        <p className="mt-3 text-sm font-semibold text-stone-400">{currentIndex + 1} / {exercises.length}</p>
      </div>
      <ProgressBar value={(completedIds.size / exercises.length) * 100} className="mt-6" />
      <div className="mt-7 grid grid-cols-3 rounded-2xl bg-stone-100 p-1" role="tablist" aria-label="Speaking difficulty">
        {(["easy", "medium", "hard"] as SpeakingMode[]).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={mode === item} onClick={() => setMode(item)} className={cn("min-h-11 rounded-xl text-sm font-semibold capitalize transition focus:outline-none focus:ring-4 focus:ring-moss-100", mode === item ? "bg-white text-moss-700 shadow-sm" : "text-stone-500")}>{item}</button>
        ))}
      </div>

      <Card className="mt-5 p-6 sm:p-8">
        <p className="text-sm font-semibold text-stone-500">{exercise.prompt}</p>
        <div className="mt-5 min-h-28 rounded-3xl bg-moss-50 p-6 text-center">
          <p className="font-serif text-2xl leading-10">{speakingPrompt(exercise, mode)}</p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button type="button" variant="secondary" onClick={() => setShowModelAnswer((value) => !value)}>
            <Eye className="size-4" /> {showModelAnswer ? "Hide model answer" : "Show model answer"}
          </Button>
          {!speaking ? (
            <Button type="button" onClick={() => setSpeaking(true)}><Mic2 className="size-4" /> Start Speaking</Button>
          ) : (
            <Button type="button" onClick={stop} className="bg-persimmon-500 hover:bg-persimmon-600"><Square className="size-4 fill-current" /> Stop</Button>
          )}
        </div>
        {speaking && (
          <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm font-semibold text-persimmon-600" role="status">
            <span className="size-3 animate-pulse rounded-full bg-persimmon-500" /> Self-practice timer active · audio is not recorded
          </div>
        )}
        {showModelAnswer && (
          <div className="mt-5 rounded-2xl bg-stone-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Model answer</p>
            <p className="mt-2 font-serif text-lg">{exercise.modelAnswer}</p>
          </div>
        )}
        {latest && (
          <div className="mt-7">
            <SpeakingFeedback event={latest} modelAnswer={exercise.modelAnswer} />
            <Button type="button" variant="secondary" className="mt-4" onClick={() => setSpeaking(true)}><RotateCcw className="size-4" /> Try Again</Button>
            {currentIndex < exercises.length - 1 && (
              <Button type="button" className="mt-4 sm:ml-3" onClick={nextExercise}>
                Next speaking prompt <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function speakingPrompt(
  exercise: LessonPackage["speakingExercises"][number],
  mode: SpeakingMode,
): string {
  if (mode === "easy") return exercise.easyPrompt ?? exercise.modelAnswer;
  if (mode === "hard") return exercise.hardPrompt ?? exercise.prompt;
  return exercise.mediumPrompt ?? exercise.prompt;
}
