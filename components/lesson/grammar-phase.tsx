"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Lightbulb } from "lucide-react";
import type { ExerciseDifficulty, LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import { upsertGrammarAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { AnswerFeedback } from "@/components/exercises/answer-feedback";
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
  const [typedAnswer, setTypedAnswer] = useState("");
  const [hintQuestionId, setHintQuestionId] = useState<string | null>(null);
  const grammarQuestions = lesson.grammarQuestions;

  const answeredCount = grammarQuestions.filter((question) =>
    session.grammarAnswers.some((answer) => answer.questionId === question.id),
  ).length;
  const correctCount = grammarQuestions.filter((question) =>
    session.grammarAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const savedIndex = Math.min(session.activityIndex, grammarQuestions.length - 1);
  const earliestUnansweredIndex = grammarQuestions.findIndex(
    (question) => !session.grammarAnswers.some((answer) => answer.questionId === question.id),
  );
  const savedQuestionAnswered = session.grammarAnswers.some(
    (answer) => answer.questionId === grammarQuestions[savedIndex].id,
  );
  const currentIndex =
    savedQuestionAnswered && earliestUnansweredIndex >= 0 && earliestUnansweredIndex < savedIndex
      ? earliestUnansweredIndex
      : savedIndex;
  const question = grammarQuestions[currentIndex];
  const answer = session.grammarAnswers.find((item) => item.questionId === question.id);
  const isLastQuestion = currentIndex === grammarQuestions.length - 1;
  const showHint = hintQuestionId === question.id;

  useEffect(() => {
    setTypedAnswer(answer?.selectedAnswer ?? "");
  }, [answer?.selectedAnswer, question.id]);

  function submitAnswer(selectedAnswer: string) {
    if (answer || !selectedAnswer.trim()) return;
    onChange({
      ...session,
      activityIndex: currentIndex,
      grammarAnswers: upsertGrammarAnswer(session.grammarAnswers, {
        questionId: question.id,
        type: question.type,
        selectedAnswer,
        correct: grammarAnswerIsCorrect(
          selectedAnswer,
          question.correctAnswer,
          question.acceptedAnswers,
        ),
        skill: question.skill,
      }),
    });
  }

  function nextQuestion() {
    if (!answer || isLastQuestion) return;
    setTypedAnswer("");
    setHintQuestionId(null);
    onChange({
      ...session,
      activityIndex: currentIndex + 1,
    });
  }

  if (showLesson) {
    return (
      <div>
        <div className="max-w-2xl">
          <Badge>{lesson.grammar.length} lesson patterns</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Notice the pattern, then use it.</h2>
          <p className="mt-3 leading-7 text-stone-500">Review the structure and story example before the ten-question practice.</p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {lesson.grammar.map((point) => (
            <Card key={point.id} className="p-7">
              <p className="font-serif text-3xl font-semibold">{point.pattern}</p>
              <p className="mt-2 font-semibold text-moss-700">{point.meaning}</p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">Structure</dt>
                  <dd className="mt-1 rounded-xl bg-moss-50 p-3 font-medium">{point.structure}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">When to use it</dt>
                  <dd className="mt-1 leading-6 text-stone-600">{point.usage}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">From the story</dt>
                  <dd className="mt-1 font-serif text-lg leading-7">{point.example}</dd>
                  <dd className="mt-1 text-xs text-stone-400">{point.translation}</dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
        <Button type="button" className="mt-7" onClick={() => setShowLesson(false)}>
          Start grammar practice <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={difficultyTone(question.difficulty)}>{question.difficulty}</Badge>
            <Badge tone="neutral">{question.skill}</Badge>
          </div>
          <h2 className="mt-4 text-3xl font-semibold">Grammar practice</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">Particles and connectors first, lesson patterns next, full-sentence translation last.</p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-500">{currentIndex + 1} / {grammarQuestions.length}</p>
      </div>

      <ProgressBar value={(answeredCount / grammarQuestions.length) * 100} className="mt-5" />

      <div className="mt-9 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            className="min-h-10 px-4"
            disabled={Boolean(answer)}
            onClick={() => setHintQuestionId(showHint ? null : question.id)}
          >
            <Lightbulb className="size-4" />
            {showHint ? "Hide hint" : "Show hint"}
          </Button>
          {showHint && (
            <div className="rounded-2xl bg-moss-50 px-4 py-3 text-sm text-moss-800" role="status">
              <span className="font-medium">Partial sentence: </span>
              <span className="font-serif">{question.hintFront}</span>
              <span className="px-2 text-stone-400">…</span>
              <span className="font-serif">{question.hintBack}</span>
            </div>
          )}
        </div>

        {question.answerMode === "choice" ? (
          <MultipleChoiceCard
            prompt={question.prompt}
            cue={question.cue}
            choices={question.choices}
            correctAnswer={question.correctAnswer}
            explanation={question.explanation}
            selectedAnswer={answer?.selectedAnswer}
            answered={Boolean(answer)}
            lockAfterAnswer
            onSelect={submitAnswer}
          />
        ) : (
          <section aria-labelledby="grammar-question-prompt">
            <p id="grammar-question-prompt" className="text-sm font-semibold text-stone-500">{question.prompt}</p>
            <p className="mt-5 text-2xl font-semibold leading-relaxed text-ink sm:text-3xl">{question.cue}</p>
            <label className="mt-7 block text-sm font-semibold text-stone-600" htmlFor="grammar-translation">
              Your Japanese translation
            </label>
            <textarea
              id="grammar-translation"
              rows={3}
              value={answer?.selectedAnswer ?? typedAnswer}
              disabled={Boolean(answer)}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="Type the complete sentence in Japanese"
              className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 font-serif text-lg leading-7 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 disabled:cursor-default disabled:bg-stone-50"
            />
            {!answer && (
              <Button
                type="button"
                className="mt-4"
                disabled={!typedAnswer.trim()}
                onClick={() => submitAnswer(typedAnswer)}
              >
                Check answer
              </Button>
            )}
            {answer && (
              <div className="mt-5">
                <AnswerFeedback correct={answer.correct} explanation={question.explanation} />
                {!answer.correct && (
                  <p className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
                    <span className="font-semibold text-ink">Model answer: </span>
                    <span className="font-serif">{question.correctAnswer}</span>
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {answer && !isLastQuestion && (
          <Button type="button" className="mt-6" onClick={nextQuestion}>
            Next question <ArrowRight className="size-4" />
          </Button>
        )}

        {answer && isLastQuestion && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Grammar round complete</p>
              <p className="mt-1 text-moss-700">{correctCount} of 10 correct. Continue to Reading when you are ready.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function grammarAnswerIsCorrect(
  selectedAnswer: string,
  correctAnswer: string,
  acceptedAnswers: string[] = [],
): boolean {
  const normalizedSelected = normalizeGrammarAnswer(selectedAnswer);
  return [correctAnswer, ...acceptedAnswers].some(
    (candidate) => normalizeGrammarAnswer(candidate) === normalizedSelected,
  );
}

function normalizeGrammarAnswer(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s。、，,.!?！？]/g, "");
}

function difficultyTone(difficulty: ExerciseDifficulty): "moss" | "orange" | "neutral" {
  if (difficulty === "Hard") return "orange";
  if (difficulty === "Medium") return "neutral";
  return "moss";
}
