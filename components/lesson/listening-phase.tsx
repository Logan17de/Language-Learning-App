"use client";

import { ArrowRight, Check, Headphones, MessageSquareText } from "lucide-react";
import type { ExerciseDifficulty, LessonPackage } from "@/types/lesson";
import type { LessonSession, ListeningEvent } from "@/types/lesson-session";
import { evaluateAnswer } from "@/lib/scoring-utils";
import { AudioControl } from "@/components/exercises/audio-control";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { selectNextAdaptiveQuestionIndex } from "@/lib/adaptive-difficulty";

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
  const adaptiveExercises = exercises.map((item, index) => ({
    ...item,
    difficulty:
      item.difficulty ??
      listeningDifficulty(index, exercises.length),
  }));
  const listeningAnswers = session.listeningEvents
    .filter(
      (event): event is ListeningEvent & {
        questionId: string;
        correct: boolean;
      } =>
        event.type === "answer" &&
        typeof event.questionId === "string" &&
        typeof event.correct === "boolean",
    )
    .map((event) => ({
      questionId: event.questionId,
      correct: event.correct,
    }));
  const initialIndex =
    selectNextAdaptiveQuestionIndex(adaptiveExercises, listeningAnswers, {
      targetCount: exercises.length,
    }) ?? 0;
  const currentIndex =
    listeningAnswers.length === 0
      ? initialIndex
      : Math.min(session.activityIndex, exercises.length - 1);
  const exercise = exercises[currentIndex];
  const difficulty = adaptiveExercises[currentIndex].difficulty;
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
    if (!priorAnswer || answeredIds.size >= exercises.length) return;
    const nextIndex = selectNextAdaptiveQuestionIndex(
      adaptiveExercises,
      listeningAnswers,
      { targetCount: exercises.length },
    );
    if (nextIndex === null) return;
    onChange({ ...session, activityIndex: nextIndex });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-900 text-white"><Headphones className="size-8" /></span>
        <div className="mt-6 flex justify-center gap-2">
          <Badge>Listen for meaning</Badge>
          <Badge tone={difficultyTone(difficulty)}>{difficulty}</Badge>
        </div>
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
            answerCorrect={priorAnswer?.correct}
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
        {priorAnswer && answeredIds.size < exercises.length && (
          <Button type="button" className="mt-5" onClick={nextQuestion}>
            Next listening question <ArrowRight className="size-4" />
          </Button>
        )}
      </Card>
    </div>
  );
}

function listeningDifficulty(
  index: number,
  total: number,
): ExerciseDifficulty {
  if (index === total - 1) return "Hard";
  if (index === 0) return "Easy";
  return "Medium";
}

function difficultyTone(
  difficulty: ExerciseDifficulty,
): "moss" | "orange" | "neutral" {
  if (difficulty === "Hard") return "orange";
  if (difficulty === "Medium") return "neutral";
  return "moss";
}
