"use client";

import { useEffect, useRef, useState } from "react";
import { appendInspectableInteraction } from "@/lib/lesson-support";
import {
  ArrowRight,
  CheckCircle2,
  Languages,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import type { ExerciseDifficulty, LessonPackage } from "@/types/lesson";
import type {
  GrammarTranslationQuestion,
  LessonSession,
} from "@/types/lesson-session";
import { upsertGrammarAnswer } from "@/lib/scoring-utils";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { AnswerFeedback } from "@/components/exercises/answer-feedback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  japaneseInputPreview,
  safeProductionPrompt,
} from "@/lib/japanese-input";
import { selectNextAdaptiveQuestionIndex } from "@/lib/adaptive-difficulty";
import {
  answerSafeInspectableTerms,
  questionAllowsTappableWords,
} from "@/lib/lesson-question-inspection";

const QUESTION_TARGET = 7;
export function GrammarPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const standardQuestions = lesson.grammarQuestions;
  const [showLesson, setShowLesson] = useState(
    session.grammarAnswers.length === 0,
  );
  const [typedAnswer, setTypedAnswer] = useState("");

  const standardAnsweredCount = session.grammarAnswers.filter((answer) =>
    standardQuestions.some((question) => question.id === answer.questionId),
  ).length;
  const standardCorrectCount = standardQuestions.filter((question) =>
    session.grammarAnswers.some(
      (answer) => answer.questionId === question.id && answer.correct,
    ),
  ).length;
  const standardComplete = standardAnsweredCount >= Math.min(
    QUESTION_TARGET,
    standardQuestions.length,
  );

  const initialIndex =
    selectNextAdaptiveQuestionIndex(
      standardQuestions,
      session.grammarAnswers,
      { targetCount: QUESTION_TARGET },
    ) ?? 0;
  const currentIndex =
    standardAnsweredCount === 0
      ? initialIndex
      : Math.min(session.activityIndex, standardQuestions.length - 1);
  const question = standardQuestions[currentIndex];
  const answer = question
    ? session.grammarAnswers.find((item) => item.questionId === question.id)
    : undefined;
  const convertedAnswer = japaneseInputPreview(typedAnswer);
  const inspectableTerms = question
    ? answerSafeInspectableTerms({
        enabled:
          question.tappableWords ?? questionAllowsTappableWords(question.cue),
        prompt: question.prompt,
        correctAnswer: question.correctAnswer,
        targetItemIds: question.targetItemIds,
        terms: question.inspectableTerms.length
          ? question.inspectableTerms
          : lesson.story.flatMap((line) => line.words),
      })
    : [];

  function submitStandardAnswer(selectedAnswer: string) {
    if (!question || answer || !selectedAnswer.trim()) return;
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

  function nextStandardQuestion() {
    if (!answer || standardComplete) return;
    const nextIndex = selectNextAdaptiveQuestionIndex(
      standardQuestions,
      session.grammarAnswers,
      { targetCount: QUESTION_TARGET },
    );
    if (nextIndex === null) return;
    setTypedAnswer("");
    onChange({
      ...session,
      activityIndex: nextIndex,
    });
  }






  if (showLesson) {
    return (
      <div>
        <div className="max-w-2xl">
          <Badge>{lesson.grammar.length} lesson patterns</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Notice the pattern, then use it.
          </h2>
          <p className="mt-3 leading-7 text-stone-500">
            Read how each pattern is built and when it is used, then practise
            recognising it.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {lesson.grammar.map((point) => (
            <Card key={point.id} className="p-7">
              <p className="font-serif text-3xl font-semibold" lang="ja">
                {point.pattern}
              </p>
              <dl className="mt-6 space-y-4 text-sm">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">
                    Structure
                  </dt>
                  <dd className="mt-1 rounded-xl bg-moss-50 p-3 font-medium">
                    {point.structure}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">
                    When to use it
                  </dt>
                  <dd className="mt-1 leading-6 text-stone-600">{point.usage}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wide text-stone-400">
                    Example
                  </dt>
                  <dd className="mt-1 font-serif text-lg leading-7" lang="ja">
                    {point.example}
                  </dd>
                  <dd className="mt-1 text-xs text-stone-400">
                    {point.translation}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
        <Button
          type="button"
          className="mt-7"
          onClick={() => setShowLesson(false)}
        >
          Start grammar practice <ArrowRight className="size-4" />
        </Button>
      </div>
    );
  }

  if (!question) return null;
  const nextAction = answer && !standardComplete ? (
    <Button
      type="button"
      className="h-full min-h-14 px-5"
      onClick={nextStandardQuestion}
    >
      Next <ArrowRight className="size-4" />
    </Button>
  ) : null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={difficultyTone(question.difficulty)}>
              {question.difficulty}
            </Badge>
            <Badge tone="neutral">{question.skill}</Badge>
          </div>
          <h2 className="mt-4 text-3xl font-semibold">Grammar practice</h2>
          <p className="mt-2 text-sm leading-6 text-stone-500">
            First recognize how the lesson patterns work. Then you’ll produce
            them yourself in translation.
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-500">
          {Math.min(
            standardAnsweredCount + (answer ? 0 : 1),
            QUESTION_TARGET,
          )}{" "}
          / {Math.min(QUESTION_TARGET, standardQuestions.length)}
        </p>
      </div>

      <ProgressBar
        value={
          (standardAnsweredCount /
            Math.min(QUESTION_TARGET, standardQuestions.length)) *
          100
        }
        className="mt-5"
      />

      <div className="mt-9 rounded-4xl border border-black/[.06] bg-white p-6 shadow-card sm:p-9">
        {question.answerMode === "choice" ? (
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
            inspectableTerms={inspectableTerms}
            onInspect={(word, reveal) =>
              onChange(
                appendInspectableInteraction(session, question.id, word, reveal),
              )
            }
            onSelect={submitStandardAnswer}
            answerAction={nextAction}
          />
        ) : (
          <section aria-labelledby="grammar-question-prompt">
            <p
              id="grammar-question-prompt"
              className="text-sm font-semibold text-stone-500"
            >
              <InspectableText
                text={safeProductionPrompt(question.prompt, question.cue)}
                terms={inspectableTerms}
                onReveal={(word, reveal) =>
                  onChange(
                    appendInspectableInteraction(
                      session,
                      question.id,
                      word,
                      reveal,
                    ),
                  )
                }
              />
            </p>
            <label
              className="mt-7 block text-sm font-semibold text-stone-600"
              htmlFor="grammar-answer"
            >
              Your answer
            </label>
            <textarea
              id="grammar-answer"
              rows={3}
              value={answer?.selectedAnswer ?? typedAnswer}
              disabled={Boolean(answer)}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="Type Japanese or romaji…"
              className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 font-serif text-lg leading-7 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 disabled:cursor-default disabled:bg-stone-50"
            />
            {!answer && convertedAnswer && (
              <div
                className="mt-3 rounded-2xl border border-moss-100 bg-moss-50 p-4"
                role="status"
              >
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-moss-600">
                  <Languages className="size-4" /> Japanese input preview
                </p>
                <p className="mt-2 font-serif text-xl leading-8 text-ink">
                  {convertedAnswer}
                </p>
              </div>
            )}
            {!answer && (
              <Button
                type="button"
                className="mt-4"
                disabled={!typedAnswer.trim()}
                onClick={() =>
                  submitStandardAnswer(convertedAnswer ?? typedAnswer)
                }
              >
                Check answer
              </Button>
            )}
            {answer && (
              <div
                className="answer-result-row mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch"
                data-answer-result-row
              >
                <div className="min-w-0 flex-1">
                  <AnswerFeedback
                    correct={answer.correct}
                    explanation={question.explanation}
                  />
                  {!answer.correct && (
                    <p className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
                      <span className="font-semibold text-ink">
                        Model answer:{" "}
                      </span>
                      <span className="font-serif">{question.correctAnswer}</span>
                    </p>
                  )}
                </div>
                {nextAction && (
                  <div className="flex shrink-0 items-stretch sm:min-w-40 [&>*]:w-full">
                    {nextAction}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {answer && standardComplete && (
          <div className="mt-6 rounded-3xl border border-moss-200 bg-moss-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <CheckCircle2 className="size-5 shrink-0 text-moss-700" />
              <div className="flex-1">
                <p className="font-semibold">Recognition practice complete</p>
                <p className="mt-1 text-sm text-moss-700">
                  {standardCorrectCount} of {standardAnsweredCount} correct.
                </p>
              </div>
              <p className="text-sm font-semibold text-moss-800">
                Continue to Reading when you’re ready.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function grammarAnswerIsCorrect(
  answer: string,
  correctAnswer: string,
  acceptedAnswers: string[],
) {
  const normalized = answer.normalize("NFKC").replace(/\s+/g, "").trim();
  return [correctAnswer, ...acceptedAnswers].some(
    (candidate) =>
      candidate.normalize("NFKC").replace(/\s+/g, "").trim() === normalized,
  );
}

function difficultyTone(difficulty: ExerciseDifficulty) {
  return difficulty === "Easy"
    ? "moss"
    : difficulty === "Medium"
      ? "orange"
      : "neutral";
}
