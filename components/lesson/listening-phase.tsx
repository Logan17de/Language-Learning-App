"use client";

import { ArrowRight, Check, Headphones, MessageSquareText } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, ListeningEvent } from "@/types/lesson-session";
import { evaluateAnswer } from "@/lib/scoring-utils";
import { AudioControl } from "@/components/exercises/audio-control";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export function ListeningPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const exercises = lesson.listeningExercises;
  const answeredIds = new Set(
    session.listeningEvents
      .filter((event) => event.type === "answer")
      .map((event) => event.questionId)
      .filter(Boolean),
  );
  const currentIndex = Math.min(session.activityIndex, exercises.length - 1);
  const exercise = exercises[currentIndex];
  const priorAnswer = session.listeningEvents.findLast(
    (event) => event.type === "answer" && event.questionId === exercise.id,
  );
  const replayCount = session.listeningEvents.filter(
    (event) =>
      event.questionId === exercise.id &&
      (event.type === "play" || event.type === "replay"),
  ).length;

  function play() {
    const count = replayCount + 1;
    const events: ListeningEvent[] = [
      ...session.listeningEvents,
      { id: `listen_${exercise.id}_${session.listeningEvents.length + 1}`, questionId: exercise.id, type: count === 1 ? "play" : "replay", replayCount: count, elapsedSeconds: session.elapsedSeconds },
    ];
    if (count >= 3) {
      events.push({ id: `difficulty_${exercise.id}_${events.length + 1}`, questionId: exercise.id, type: "difficulty-signal", replayCount: count, elapsedSeconds: session.elapsedSeconds });
    }
    onChange({ ...session, listeningEvents: events });
  }

  function answer(value: string) {
    const correct = evaluateAnswer(value, exercise.correctAnswer);
    const otherEvents = session.listeningEvents.filter(
      (event) => !(event.type === "answer" && event.questionId === exercise.id),
    );
    const answeredAfter = new Set([...answeredIds, exercise.id]);
    onChange({
      ...session,
      activityIndex: currentIndex,
      listeningComplete: exercises.every((item) => answeredAfter.has(item.id)),
      listeningEvents: [
        ...otherEvents,
        { id: `answer_${exercise.id}_${session.listeningEvents.length + 1}`, questionId: exercise.id, type: "answer", replayCount, correct, selectedAnswer: value, elapsedSeconds: session.elapsedSeconds },
      ],
    });
  }

  function nextQuestion() {
    if (!priorAnswer || currentIndex >= exercises.length - 1) return;
    onChange({ ...session, activityIndex: currentIndex + 1 });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-900 text-white"><Headphones className="size-8" /></span>
        <Badge className="mt-6">Listen for meaning</Badge>
        <h2 className="mt-4 text-3xl font-semibold">{lesson.japaneseTitle}</h2>
        <p className="mt-3 text-stone-500">The transcript stays hidden until you answer.</p>
        <p className="mt-3 text-sm font-semibold text-stone-400">{currentIndex + 1} / {exercises.length}</p>
      </div>

      <Card className="mt-8 p-6 sm:p-8">
        <ProgressBar value={(answeredIds.size / exercises.length) * 100} className="mb-6" />
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
            selectedAnswer={priorAnswer?.selectedAnswer}
            answered={Boolean(priorAnswer)}
            onSelect={answer}
          />
        </div>

        {priorAnswer && (
          <div className="mt-7 rounded-2xl bg-moss-50 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-moss-700"><MessageSquareText className="size-4" /> Transcript revealed</p>
            <p className="mt-4 whitespace-pre-line font-serif text-lg leading-8">
              {exercise.transcript ?? lesson.readingConversation.map((line) => `${line.speaker}：${line.japanese}`).join("\n")}
            </p>
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-moss-700"><Check className="size-4" /> Listening answer saved</p>
          </div>
        )}
        {priorAnswer && currentIndex < exercises.length - 1 && (
          <Button type="button" className="mt-5" onClick={nextQuestion}>
            Next listening question <ArrowRight className="size-4" />
          </Button>
        )}
      </Card>
    </div>
  );
}
