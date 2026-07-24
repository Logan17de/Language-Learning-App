"use client";

import { ArrowRight, RotateCcw } from "lucide-react";
import { vocabularyQuestions } from "@/data/mock-activities";
import type { LessonSession } from "@/types/lesson-session";
import { evaluateAnswer, upsertVocabularyAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";

export function VocabularyPhase({
  session,
  onChange,
}: {
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const completedCount = vocabularyQuestions.filter((question) =>
    session.vocabularyAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const currentIndex = Math.min(session.activityIndex, vocabularyQuestions.length - 1);
  const question = vocabularyQuestions[currentIndex];
  const answer = session.vocabularyAnswers.find((item) => item.questionId === question.id);
  const phaseComplete = completedCount === vocabularyQuestions.length;

  function select(selectedAnswer: string) {
    const correct = evaluateAnswer(selectedAnswer, question.correctAnswer);
    onChange({
      ...session,
      activityIndex: currentIndex,
      vocabularyAnswers: upsertVocabularyAnswer(session.vocabularyAnswers, {
        questionId: question.id,
        mode: question.mode,
        selectedAnswer,
        correct,
      }),
    });
  }

  if (phaseComplete) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-100 text-3xl">語</span>
        <Badge className="mt-7">5 of 5 complete</Badge>
        <h2 className="mt-4 text-3xl font-semibold">Words ready for context.</h2>
        <p className="mt-3 text-stone-500">You practiced every item across four recognition directions.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Badge tone="orange">{question.modeLabel}</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Vocabulary & kanji</h2>
        </div>
        <p className="text-sm font-semibold text-stone-500">{currentIndex + 1} / {vocabularyQuestions.length}</p>
      </div>
      <ProgressBar value={(completedCount / vocabularyQuestions.length) * 100} className="mt-5" />
      <div className="mt-9 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        <MultipleChoiceCard
          prompt={question.prompt}
          cue={question.cue}
          choices={question.choices}
          correctAnswer={question.correctAnswer}
          explanation={question.explanation}
          selectedAnswer={answer?.selectedAnswer}
          answered={Boolean(answer)}
          onSelect={select}
        />
        {answer && !answer.correct && (
          <Button type="button" variant="secondary" className="mt-5" onClick={() => onChange({
            ...session,
            vocabularyAnswers: session.vocabularyAnswers.map((item) =>
              item.questionId === question.id ? { ...item, selectedAnswer: "" } : item,
            ),
          })}>
            <RotateCcw className="size-4" /> Try again
          </Button>
        )}
        {answer?.correct && (
          <Button type="button" className="mt-5" onClick={() => onChange({ ...session, activityIndex: Math.min(currentIndex + 1, vocabularyQuestions.length - 1) })}>
            Next word <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
