"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { vocabularyQuestions } from "@/data/mock-activities";
import type { ExerciseDifficulty } from "@/data/mock-activities";
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
  const answeredCount = vocabularyQuestions.filter((question) =>
    session.vocabularyAnswers.some((answer) => answer.questionId === question.id),
  ).length;
  const correctCount = vocabularyQuestions.filter((question) =>
    session.vocabularyAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const savedIndex = Math.min(session.activityIndex, vocabularyQuestions.length - 1);
  const earliestUnansweredIndex = vocabularyQuestions.findIndex(
    (question) => !session.vocabularyAnswers.some((answer) => answer.questionId === question.id),
  );
  const savedQuestionAnswered = session.vocabularyAnswers.some(
    (answer) => answer.questionId === vocabularyQuestions[savedIndex].id,
  );
  const currentIndex =
    savedQuestionAnswered && earliestUnansweredIndex >= 0 && earliestUnansweredIndex < savedIndex
      ? earliestUnansweredIndex
      : savedIndex;
  const question = vocabularyQuestions[currentIndex];
  const answer = session.vocabularyAnswers.find((item) => item.questionId === question.id);
  const isLastQuestion = currentIndex === vocabularyQuestions.length - 1;

  function select(selectedAnswer: string) {
    if (answer) return;
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

  function nextQuestion() {
    if (!answer || isLastQuestion) return;
    onChange({
      ...session,
      activityIndex: currentIndex + 1,
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={difficultyTone(question.difficulty)}>{question.difficulty}</Badge>
            <Badge tone="neutral">{question.modeLabel}</Badge>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Vocabulary & kanji</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">Ten questions build from direct recognition to vocabulary in context.</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-500">{currentIndex + 1} / {vocabularyQuestions.length}</p>
      </div>

      <ProgressBar value={(answeredCount / vocabularyQuestions.length) * 100} className="mt-5" />

      <div className="mt-9 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        <MultipleChoiceCard
          prompt={question.prompt}
          cue={question.cue}
          choices={question.choices}
          correctAnswer={question.correctAnswer}
          explanation={question.explanation}
          selectedAnswer={answer?.selectedAnswer}
          answered={Boolean(answer)}
          lockAfterAnswer
          onSelect={select}
        />

        {answer && !isLastQuestion && (
          <Button type="button" className="mt-6" onClick={nextQuestion}>
            Next question <ArrowRight className="size-4" />
          </Button>
        )}

        {answer && isLastQuestion && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Vocabulary round complete</p>
              <p className="mt-1 text-moss-700">{correctCount} of 10 correct. Continue to Grammar when you are ready.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function difficultyTone(difficulty: ExerciseDifficulty): "moss" | "orange" | "neutral" {
  if (difficulty === "Hard") return "orange";
  if (difficulty === "Medium") return "neutral";
  return "moss";
}
