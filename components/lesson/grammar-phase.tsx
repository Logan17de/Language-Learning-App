"use client";

import { useState } from "react";
import { ArrowRight, BookOpenCheck, ChevronDown, Lightbulb, RotateCcw, TriangleAlert } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import { grammarQuestions } from "@/data/mock-activities";
import { evaluateAnswer, upsertGrammarAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export function GrammarPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const [showLesson, setShowLesson] = useState(session.grammarAnswers.length === 0);
  const completedCount = grammarQuestions.filter((question) =>
    session.grammarAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const currentIndex = Math.min(session.activityIndex, grammarQuestions.length - 1);
  const question = grammarQuestions[currentIndex];
  const answer = session.grammarAnswers.find((item) => item.questionId === question.id);
  const phaseComplete = completedCount === grammarQuestions.length;

  function select(selectedAnswer: string) {
    onChange({
      ...session,
      activityIndex: currentIndex,
      grammarAnswers: upsertGrammarAnswer(session.grammarAnswers, {
        questionId: question.id,
        type: question.type,
        selectedAnswer,
        correct: evaluateAnswer(selectedAnswer, question.correctAnswer),
        skill: question.skill,
      }),
    });
  }

  if (showLesson && !phaseComplete) {
    return (
      <div>
        <div className="max-w-2xl">
          <Badge>Two useful patterns</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Notice the pattern, then produce it.</h2>
          <p className="mt-3 leading-7 text-stone-500">Each explanation comes directly from today’s story.</p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {lesson.grammar.map((point) => (
            <Card key={point.id} className="p-7">
              <p className="font-serif text-3xl font-semibold">{point.pattern}</p>
              <p className="mt-2 font-semibold text-moss-700">{point.meaning}</p>
              <dl className="mt-6 space-y-4 text-sm">
                <div><dt className="text-xs font-bold uppercase tracking-wide text-stone-400">Structure</dt><dd className="mt-1 rounded-xl bg-moss-50 p-3 font-medium">{point.structure}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-stone-400">When to use it</dt><dd className="mt-1 leading-6 text-stone-600">{point.usage}</dd></div>
                <div><dt className="text-xs font-bold uppercase tracking-wide text-stone-400">From the story</dt><dd className="mt-1 font-serif text-lg leading-7">{point.example}</dd><dd className="mt-1 text-xs text-stone-400">{point.translation}</dd></div>
              </dl>
              <details className="mt-5 rounded-2xl border border-persimmon-100 bg-persimmon-50 p-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-persimmon-600">
                  <TriangleAlert className="size-4" /> Common mistake <ChevronDown className="ml-auto size-4" />
                </summary>
                <p className="mt-3 text-sm leading-6 text-stone-600">{point.commonMistake}</p>
              </details>
            </Card>
          ))}
        </div>
        <Button type="button" className="mt-7" onClick={() => setShowLesson(false)}>
          Practice these patterns <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (phaseComplete) {
    const understanding = session.grammarAnswers.filter((answer) => answer.skill === "understanding" && answer.correct).length;
    const production = session.grammarAnswers.filter((answer) => answer.skill === "production" && answer.correct).length;
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-moss-100 text-moss-700"><BookOpenCheck className="size-9" /></span>
        <h2 className="mt-7 text-3xl font-semibold">Patterns connected.</h2>
        <p className="mt-3 text-stone-500">Understanding {understanding}/2 · Production {production}/2</p>
        <Button type="button" variant="secondary" className="mt-6" onClick={() => setShowLesson(true)}><Lightbulb className="size-4" /> Review explanations</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div><Badge tone={question.skill === "production" ? "orange" : "moss"}>{question.skill}</Badge><h2 className="mt-4 text-3xl font-semibold">Grammar practice</h2></div>
        <p className="text-sm font-semibold text-stone-500">{currentIndex + 1} / {grammarQuestions.length}</p>
      </div>
      <ProgressBar value={(completedCount / grammarQuestions.length) * 100} className="mt-5" />
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
        {answer && !answer.correct && <Button type="button" variant="secondary" className="mt-5" onClick={() => onChange({
          ...session,
          grammarAnswers: session.grammarAnswers.map((item) =>
            item.questionId === question.id ? { ...item, selectedAnswer: "" } : item,
          ),
        })}><RotateCcw className="size-4" /> Try again</Button>}
        {answer?.correct && <Button type="button" className="mt-5" onClick={() => onChange({ ...session, activityIndex: Math.min(currentIndex + 1, grammarQuestions.length - 1) })}>Next activity <ArrowRight className="size-4" /></Button>}
      </div>
    </div>
  );
}
