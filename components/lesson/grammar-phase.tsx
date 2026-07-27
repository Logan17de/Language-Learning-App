"use client";

import { useState } from "react";
import { appendInspectableInteraction } from "@/lib/lesson-support";
import { ArrowRight, CheckCircle2, Languages, Lightbulb } from "lucide-react";
import type { ExerciseDifficulty, LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
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

const QUESTION_TARGET = 10;

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

  const answeredCount = session.grammarAnswers.filter((answer) =>
    grammarQuestions.some((question) => question.id === answer.questionId),
  ).length;
  const correctCount = grammarQuestions.filter((question) =>
    session.grammarAnswers.some((answer) => answer.questionId === question.id && answer.correct),
  ).length;
  const initialIndex =
    selectNextAdaptiveQuestionIndex(
      grammarQuestions,
      session.grammarAnswers,
      { targetCount: QUESTION_TARGET },
    ) ?? 0;
  const currentIndex =
    session.grammarAnswers.length === 0
      ? initialIndex
      : Math.min(session.activityIndex, grammarQuestions.length - 1);
  const question = grammarQuestions[currentIndex];
  const answer = session.grammarAnswers.find((item) => item.questionId === question.id);
  const roundComplete = answeredCount >= Math.min(QUESTION_TARGET, grammarQuestions.length);
  const showHint = hintQuestionId === question.id;
  const convertedAnswer = japaneseInputPreview(typedAnswer);
  const inspectableTerms = question.inspectableTerms.length
    ? question.inspectableTerms
    : lesson.story.flatMap((line) => line.words);
  const productionStem = question.hintFront.trim();

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
    if (!answer || roundComplete) return;
    const nextIndex = selectNextAdaptiveQuestionIndex(
      grammarQuestions,
      session.grammarAnswers,
      { targetCount: QUESTION_TARGET },
    );
    if (nextIndex === null) return;
    setTypedAnswer("");
    setHintQuestionId(null);
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
        <p className="shrink-0 text-sm font-semibold text-stone-500">{Math.min(answeredCount + (answer ? 0 : 1), QUESTION_TARGET)} / {Math.min(QUESTION_TARGET, grammarQuestions.length)}</p>
      </div>

      <ProgressBar value={(answeredCount / Math.min(QUESTION_TARGET, grammarQuestions.length)) * 100} className="mt-5" />

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
          answerCorrect={answer?.correct}
            lockAfterAnswer
            inspectChoices={false}
            inspectableTerms={inspectableTerms}
            onInspect={(word, reveal) => onChange(appendInspectableInteraction(session, question.id, word, reveal))}
            onSelect={submitAnswer}
          />
        ) : (
          <section aria-labelledby="grammar-question-prompt">
            <p id="grammar-question-prompt" className="text-sm font-semibold text-stone-500">
              <InspectableText
                text={safeProductionPrompt(question.prompt, question.cue)}
                terms={inspectableTerms}
                onReveal={(word, reveal) => onChange(appendInspectableInteraction(session, question.id, word, reveal))}
              />
            </p>
            {productionStem && (
              <p className="mt-5 rounded-2xl bg-moss-50 px-5 py-4 font-serif text-xl leading-9 text-ink">
                <InspectableText
                  text={productionStem}
                  terms={inspectableTerms}
                  onReveal={(word, reveal) => onChange(appendInspectableInteraction(session, question.id, word, reveal))}
                />
                <span className="ml-2 tracking-widest text-stone-400" aria-label="Complete the sentence">
                  ＿＿
                </span>
              </p>
            )}
            <label className="mt-7 block text-sm font-semibold text-stone-600" htmlFor="grammar-translation">
              Your answer
            </label>
            <textarea
              id="grammar-translation"
              rows={3}
              value={answer?.selectedAnswer ?? typedAnswer}
              disabled={Boolean(answer)}
              onChange={(event) => setTypedAnswer(event.target.value)}
              placeholder="Type Japanese or romaji, for example: hana wa kirei datta"
              className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 font-serif text-lg leading-7 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 disabled:cursor-default disabled:bg-stone-50"
            />
            {!answer && convertedAnswer && (
              <div className="mt-3 rounded-2xl border border-moss-100 bg-moss-50 p-4" role="status">
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
                onClick={() => submitAnswer(convertedAnswer ?? typedAnswer)}
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

        {answer && !roundComplete && (
          <Button type="button" className="mt-6" onClick={nextQuestion}>
            Next question <ArrowRight className="size-4" />
          </Button>
        )}

        {answer && roundComplete && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">Grammar round complete</p>
              <p className="mt-1 text-moss-700">{correctCount} of {answeredCount} correct. Continue to Reading when you are ready.</p>
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
