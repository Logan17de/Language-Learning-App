"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { appendInspectableInteraction } from "@/lib/lesson-support";
import type { ExerciseDifficulty, LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import { evaluateAnswer, upsertVocabularyAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { selectNextAdaptiveQuestionIndex } from "@/lib/adaptive-difficulty";
import { CANONICAL_LESSON_ACTIVITY_COUNTS } from "@/lib/lesson-contract";

const QUESTION_TARGET = CANONICAL_LESSON_ACTIVITY_COUNTS.vocabulary;

export function VocabularyPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const vocabularyQuestions = lesson.vocabularyQuestions;
  const answeredCount = session.vocabularyAnswers.filter((answer) =>
    vocabularyQuestions.some((question) => question.id === answer.questionId),
  ).length;
  const correctCount = vocabularyQuestions.filter((question) =>
    session.vocabularyAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const initialIndex =
    selectNextAdaptiveQuestionIndex(
      vocabularyQuestions,
      session.vocabularyAnswers,
      { targetCount: QUESTION_TARGET },
    ) ?? 0;
  const currentIndex =
    session.vocabularyAnswers.length === 0
      ? initialIndex
      : Math.min(session.activityIndex, vocabularyQuestions.length - 1);
  const question = vocabularyQuestions[currentIndex];
  const answer = session.vocabularyAnswers.find((item) => item.questionId === question.id);
  const roundComplete = answeredCount >= QUESTION_TARGET;

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
    if (!answer || roundComplete) return;
    const nextIndex = selectNextAdaptiveQuestionIndex(
      vocabularyQuestions,
      session.vocabularyAnswers,
      { targetCount: QUESTION_TARGET },
    );
    if (nextIndex === null) return;
    onChange({
      ...session,
      activityIndex: nextIndex,
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
          <p className="mt-2 text-sm leading-6 text-stone-500">Thirteen questions build from direct recognition to vocabulary in context.</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-500">{Math.min(answeredCount + (answer ? 0 : 1), QUESTION_TARGET)} / {QUESTION_TARGET}</p>
      </div>

      <ProgressBar value={(answeredCount / QUESTION_TARGET) * 100} className="mt-5" />

      <div className="mt-9 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        <MultipleChoiceCard
          prompt={question.prompt}
          cue={question.cue}
          choices={question.choices}
          correctAnswer={question.correctAnswer}
          explanation={question.explanation}
          selectedAnswer={answer?.selectedAnswer}
          answered={Boolean(answer)}
          answerCorrect={answer?.correct}
          lockAfterAnswer
          inspectChoices={false}
          inspectableTerms={question.inspectableTerms.length ? question.inspectableTerms : lesson.story.flatMap((line) => line.words)}
          onInspect={(word, reveal) => onChange(appendInspectableInteraction(session, question.id, word, reveal))}
          onSelect={select}
        />

        {answer && !roundComplete && (
          <Button type="button" className="mt-6" onClick={nextQuestion}>
            Next question <ArrowRight className="size-4" />
          </Button>
        )}

        {answer && roundComplete && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Vocabulary round complete</p>
              <p className="mt-1 text-moss-700">{correctCount} of {answeredCount} correct. Continue to Grammar when you are ready.</p>
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
