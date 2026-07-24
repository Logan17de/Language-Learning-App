"use client";

import { useState } from "react";
import { Check, Headphones, MessageSquareText } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, ListeningEvent } from "@/types/lesson-session";
import { evaluateAnswer } from "@/lib/scoring-utils";
import { AudioControl } from "@/components/exercises/audio-control";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function ListeningPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const exercise = lesson.listeningExercises[0];
  const priorAnswer = session.listeningEvents.findLast((event) => event.type === "answer");
  const replayCount = session.listeningEvents.filter((event) => event.type === "play" || event.type === "replay").length;
  const [selected, setSelected] = useState<string | undefined>(
    priorAnswer?.selectedAnswer,
  );

  function play() {
    const count = replayCount + 1;
    const events: ListeningEvent[] = [
      ...session.listeningEvents,
      { id: `listen_${session.listeningEvents.length + 1}`, type: count === 1 ? "play" : "replay", replayCount: count, elapsedSeconds: session.elapsedSeconds },
    ];
    if (count >= 3) {
      events.push({ id: `difficulty_${events.length + 1}`, type: "difficulty-signal", replayCount: count, elapsedSeconds: session.elapsedSeconds });
    }
    onChange({ ...session, listeningEvents: events });
  }

  function answer(value: string) {
    const correct = evaluateAnswer(value, exercise.correctAnswer);
    setSelected(value);
    onChange({
      ...session,
      listeningComplete: true,
      listeningEvents: [
        ...session.listeningEvents.filter((event) => event.type !== "answer"),
        { id: `answer_${session.listeningEvents.length + 1}`, type: "answer", replayCount, correct, selectedAnswer: value, elapsedSeconds: session.elapsedSeconds },
      ],
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-900 text-white"><Headphones className="size-8" /></span>
        <Badge className="mt-6">Listen for meaning</Badge>
        <h2 className="mt-4 text-3xl font-semibold">A moment on the commute</h2>
        <p className="mt-3 text-stone-500">The transcript stays hidden until you answer.</p>
      </div>

      <Card className="mt-8 p-6 sm:p-8">
        <AudioControl replayCount={replayCount} onPlay={play} label="Play conversation" large />
        <div className="mt-4 flex items-center justify-between text-xs text-stone-400">
          <span>Replay {replayCount} · first replay has no penalty</span>
          {replayCount >= 3 && <span className="font-semibold text-persimmon-600">Difficulty signal noted</span>}
        </div>

        <div className="mt-8 border-t border-stone-100 pt-8">
          <MultipleChoiceCard
            prompt={exercise.prompt}
            choices={exercise.choices}
            correctAnswer={exercise.correctAnswer}
            explanation={exercise.explanation}
            selectedAnswer={selected}
            answered={Boolean(priorAnswer || selected)}
            onSelect={answer}
          />
        </div>

        {session.listeningComplete && (
          <div className="mt-7 rounded-2xl bg-moss-50 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-moss-700"><MessageSquareText className="size-4" /> Transcript revealed</p>
            <div className="mt-4 space-y-3">
              <p className="font-serif text-lg">ゆき：改札で田中さんに会いました。</p>
              <p className="font-serif text-lg">田中：電車で話しながら行きましょう。</p>
            </div>
            <p className="mt-3 text-xs text-stone-500">Yuki met Tanaka at the ticket gate. Tanaka suggests chatting while they ride.</p>
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-moss-700"><Check className="size-4" /> Listening activity complete</p>
          </div>
        )}
      </Card>
    </div>
  );
}
