"use client";

import { Check, RotateCcw, Trophy } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, ReviewAnswer } from "@/types/lesson-session";
import { calculateReviewResult, evaluateAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";

export function FinalReviewPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const finalReviewQuestions = lesson.reviewQuestions;
  const attemptedCount = session.reviewAnswers.length;
  const currentIndex = Math.min(session.activityIndex, finalReviewQuestions.length - 1);
  const question = finalReviewQuestions[currentIndex];
  const answer = session.reviewAnswers.find((item) => item.questionId === question.id);
  const complete = session.reviewResult?.totalCount === finalReviewQuestions.length;

  function select(selectedAnswer: string) {
    if (answer) return;
    const nextAnswer: ReviewAnswer = {
      questionId: question.id,
      category: question.category ?? "vocabulary",
      selectedAnswer,
      correct: evaluateAnswer(selectedAnswer, question.correctAnswer),
    };
    const answers = [...session.reviewAnswers, nextAnswer];
    onChange({
      ...session,
      reviewAnswers: answers,
      reviewResult: answers.length === finalReviewQuestions.length ? calculateReviewResult(answers) : null,
    });
  }

  if (complete && session.reviewResult) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="mx-auto grid size-20 place-items-center rounded-4xl bg-persimmon-100 text-persimmon-600"><Trophy className="size-9" /></span>
          <Badge tone="orange" className="mt-6">Retrieval complete</Badge>
          <h2 className="mt-4 text-4xl font-semibold">{session.reviewResult.score}%</h2>
          <p className="mt-2 text-stone-500">{session.reviewResult.correctCount} of {session.reviewResult.totalCount} correct without hints</p>
        </div>
        <div className="mt-8 space-y-3">
          {finalReviewQuestions.map((item) => {
            const result = session.reviewAnswers.find((answerItem) => answerItem.questionId === item.id);
            return (
              <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-black/[.06] bg-white p-4">
                <span className={`grid size-7 shrink-0 place-items-center rounded-full ${result?.correct ? "bg-moss-100 text-moss-700" : "bg-persimmon-100 text-persimmon-600"}`}>
                  {result?.correct ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
                </span>
                <div><p className="text-sm font-semibold">{item.prompt}</p><p className="mt-1 text-xs text-stone-500">{result?.correct ? "Correct" : `Your answer: ${result?.selectedAnswer} · Correct: ${item.correctAnswer}`}</p></div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div><Badge tone="orange">No hints</Badge><h2 className="mt-4 text-3xl font-semibold">Final retrieval</h2><p className="mt-2 text-sm text-stone-500">Bring back what you learned across every skill.</p></div>
        <p className="text-sm font-semibold">{currentIndex + 1} / {finalReviewQuestions.length}</p>
      </div>
      <ProgressBar value={(attemptedCount / finalReviewQuestions.length) * 100} className="mt-5" />
      <div className="mt-8 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        <Badge tone="neutral" className="capitalize">{question.category}</Badge>
        <div className="mt-5">
          <MultipleChoiceCard
            prompt={question.prompt}
            choices={question.choices}
            correctAnswer={question.correctAnswer}
            explanation={question.explanation}
            selectedAnswer={answer?.selectedAnswer}
            answered={Boolean(answer)}
            onSelect={select}
          />
        </div>
        {answer && attemptedCount < finalReviewQuestions.length && (
          <Button type="button" className="mt-5" onClick={() => onChange({ ...session, activityIndex: Math.min(currentIndex + 1, finalReviewQuestions.length - 1) })}>Next question</Button>
        )}
      </div>
    </div>
  );
}
