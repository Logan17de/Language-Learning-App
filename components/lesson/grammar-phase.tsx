"use client";

import { useState } from "react";
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
const TRANSLATION_TARGET = 5;

type TranslationValidation = {
  correct?: boolean;
  feedback?: string;
  suggestion?: string;
  revealAnswer?: string;
  validationSource?: "exact_match" | "ai";
  error?: string;
};

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
  const translationQuestions = session.grammarTranslationQuestions ?? [];
  const initiallyAnsweredTranslations = session.grammarAnswers.filter((answer) =>
    translationQuestions.some((question) => question.id === answer.questionId),
  ).length;
  const [showLesson, setShowLesson] = useState(
    session.grammarAnswers.length === 0 && translationQuestions.length === 0,
  );
  const [translationStarted, setTranslationStarted] = useState(
    translationQuestions.length === TRANSLATION_TARGET,
  );
  const [translationIndex, setTranslationIndex] = useState(() =>
    translationQuestions.length > 0
      ? Math.min(initiallyAnsweredTranslations, translationQuestions.length - 1)
      : 0,
  );
  const [typedAnswer, setTypedAnswer] = useState("");
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationChecking, setTranslationChecking] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [revealedTranslationId, setRevealedTranslationId] = useState<string | null>(null);

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

  const translationAnsweredCount = session.grammarAnswers.filter((answer) =>
    translationQuestions.some((question) => question.id === answer.questionId),
  ).length;
  const translationCorrectCount = translationQuestions.filter((question) =>
    session.grammarAnswers.some(
      (answer) => answer.questionId === question.id && answer.correct,
    ),
  ).length;
  const translationComplete =
    translationQuestions.length === TRANSLATION_TARGET &&
    translationAnsweredCount === TRANSLATION_TARGET;

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

  async function beginTranslation() {
    setTranslationStarted(true);
    setTranslationError("");
    if (translationQuestions.length === TRANSLATION_TARGET) return;
    setTranslationLoading(true);
    try {
      const response = await fetch("/api/lesson/translation/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id }),
      });
      const result = (await response.json().catch(() => null)) as
        | { questions?: GrammarTranslationQuestion[]; error?: string }
        | null;
      if (!response.ok || !Array.isArray(result?.questions)) {
        setTranslationError(
          result?.error || "AIko could not prepare translation practice.",
        );
        return;
      }
      if (result.questions.length !== TRANSLATION_TARGET) {
        setTranslationError("Translation practice did not return five questions.");
        return;
      }
      setTranslationIndex(0);
      setTypedAnswer("");
      setRevealedTranslationId(null);
      onChange({
        ...session,
        grammarTranslationQuestions: result.questions,
      });
    } catch {
      setTranslationError(
        "The connection was interrupted while preparing translation practice.",
      );
    } finally {
      setTranslationLoading(false);
    }
  }

  const translationQuestion = translationQuestions[translationIndex];
  const translationAnswer = translationQuestion
    ? session.grammarAnswers.find(
        (item) => item.questionId === translationQuestion.id,
      )
    : undefined;

  async function submitTranslation() {
    if (
      !translationQuestion ||
      translationAnswer ||
      translationChecking ||
      !(convertedAnswer ?? typedAnswer).trim()
    ) {
      return;
    }
    const selectedAnswer = convertedAnswer ?? typedAnswer;
    setTranslationChecking(true);
    setTranslationError("");
    try {
      const response = await fetch("/api/lesson/translation/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: translationQuestion.id,
          answer: selectedAnswer,
        }),
      });
      const result = (await response.json().catch(() => null)) as
        | TranslationValidation
        | null;
      if (
        !response.ok ||
        !result ||
        typeof result.correct !== "boolean" ||
        typeof result.feedback !== "string" ||
        typeof result.revealAnswer !== "string" ||
        (result.validationSource !== "exact_match" && result.validationSource !== "ai") ||
        (result.suggestion !== undefined && typeof result.suggestion !== "string")
      ) {
        setTranslationError(
          result?.error || "AIko could not check this translation.",
        );
        return;
      }
      onChange({
        ...session,
        grammarAnswers: upsertGrammarAnswer(session.grammarAnswers, {
          questionId: translationQuestion.id,
          type: "natural-sentence",
          selectedAnswer,
          correct: result.correct,
          skill: "production",
          feedback: result.feedback,
          suggestion: result.suggestion,
          revealAnswer: result.revealAnswer,
          validationSource: result.validationSource,
        }),
      });
    } catch {
      setTranslationError(
        "The connection was interrupted while AIko checked your answer.",
      );
    } finally {
      setTranslationChecking(false);
    }
  }

  function nextTranslation() {
    if (!translationAnswer || translationComplete) return;
    setTranslationIndex((current) =>
      Math.min(current + 1, TRANSLATION_TARGET - 1),
    );
    setTypedAnswer("");
    setTranslationError("");
    setRevealedTranslationId(null);
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
            Review the structure and story example first. After recognition
            practice, you’ll translate five English sentences into Japanese.
          </p>
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {lesson.grammar.map((point) => (
            <Card key={point.id} className="p-7">
              <p className="font-serif text-3xl font-semibold">{point.pattern}</p>
              <p className="mt-2 font-semibold text-moss-700">{point.meaning}</p>
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
                    From the story
                  </dt>
                  <dd className="mt-1 font-serif text-lg leading-7">
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

  if (standardComplete && translationStarted) {
    if (translationLoading || translationQuestions.length !== TRANSLATION_TARGET) {
      return (
        <div className="mx-auto max-w-3xl">
          <Badge tone="orange">Translation</Badge>
          <Card className="mt-5 p-8 text-center sm:p-10">
            {translationLoading ? (
              <LoaderCircle className="mx-auto size-9 animate-spin text-moss-600" />
            ) : (
              <Sparkles className="mx-auto size-9 text-moss-600" />
            )}
            <h2 className="mt-5 text-2xl font-semibold">
              {translationLoading
                ? "Creating five translation prompts…"
                : "Translation practice needs another try."}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-500">
              AIko builds production prompts from this lesson’s grammar and your
              previous grammar practice. When there is not enough history yet, it
              reuses lesson grammar instead of testing something unseen.
            </p>
            {translationError && (
              <p
                role="alert"
                className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
              >
                {translationError}
              </p>
            )}
            {!translationLoading && (
              <Button
                type="button"
                className="mt-6"
                onClick={() => void beginTranslation()}
              >
                Try again
              </Button>
            )}
          </Card>
        </div>
      );
    }

    if (!translationQuestion) return null;
    const currentNumber = translationIndex + 1;
    const revealOpen = revealedTranslationId === translationQuestion.id;
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Badge tone="orange">Translation</Badge>
            <h2 className="mt-4 text-3xl font-semibold">
              Turn the meaning into Japanese.
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Translate naturally using grammar you’ve learned. AIko checks the
              meaning and grammar without requiring one exact model sentence.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-stone-500">
            {currentNumber} / {TRANSLATION_TARGET}
          </p>
        </div>

        <ProgressBar
          value={(translationAnsweredCount / TRANSLATION_TARGET) * 100}
          className="mt-5"
        />

        <Card className="mt-8 p-6 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-stone-400">
            Translate into Japanese
          </p>
          <p className="mt-4 text-xl font-semibold leading-8 text-ink sm:text-2xl">
            {translationQuestion.english}
          </p>

          <label
            className="mt-7 block text-sm font-semibold text-stone-600"
            htmlFor="grammar-translation"
          >
            Your Japanese
          </label>
          <textarea
            id="grammar-translation"
            rows={3}
            value={translationAnswer?.selectedAnswer ?? typedAnswer}
            disabled={Boolean(translationAnswer) || translationChecking}
            onChange={(event) => setTypedAnswer(event.target.value)}
            placeholder="Type Japanese or romaji…"
            className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 font-serif text-lg leading-7 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 disabled:cursor-default disabled:bg-stone-50"
          />

          {!translationAnswer && convertedAnswer && (
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

          {translationError && (
            <p
              role="alert"
              className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700"
            >
              {translationError}
            </p>
          )}

          {!translationAnswer && (
            <Button
              type="button"
              className="mt-5"
              disabled={!typedAnswer.trim() || translationChecking}
              onClick={() => void submitTranslation()}
            >
              {translationChecking && (
                <LoaderCircle className="size-4 animate-spin" />
              )}
              {translationChecking ? "AIko is checking…" : "Check with AIko"}
            </Button>
          )}

          {translationAnswer && (
            <div className="mt-6">
              <AnswerFeedback
                correct={translationAnswer.correct}
                explanation={
                  translationAnswer.feedback || "AIko checked your translation."
                }
              />
              {translationAnswer.suggestion && (
                <div className="mt-3 rounded-2xl bg-moss-50 p-4 text-sm leading-6 text-moss-800">
                  <p className="font-semibold">Suggestion</p>
                  <p className="mt-1">{translationAnswer.suggestion}</p>
                </div>
              )}
              {translationAnswer.revealAnswer && (
                <div className="mt-3">
                  <button
                    type="button"
                    aria-expanded={revealOpen}
                    className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-50"
                    onClick={() =>
                      setRevealedTranslationId(revealOpen ? null : translationQuestion.id)
                    }
                  >
                    {revealOpen ? "Hide answer" : "Reveal answer"}
                  </button>
                  {revealOpen && (
                    <div className="mt-3 rounded-2xl bg-stone-50 p-4 text-sm text-stone-600">
                      <p className="font-semibold text-ink">Generated answer</p>
                      <p className="mt-2 font-serif text-lg leading-7">
                        {translationAnswer.revealAnswer}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {!translationComplete ? (
                <Button
                  type="button"
                  className="mt-5"
                  onClick={nextTranslation}
                >
                  Next translation <ArrowRight className="size-4" />
                </Button>
              ) : (
                <div className="mt-5 flex items-start gap-3 rounded-2xl bg-moss-50 p-4 text-sm text-moss-800">
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                  <div>
                    <p className="font-semibold">
                      Translation practice complete
                    </p>
                    <p className="mt-1 text-moss-700">
                      {translationCorrectCount} of {TRANSLATION_TARGET} accepted.
                      Continue to Reading when you’re ready.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
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
    <div className="mx-auto max-w-3xl">
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
                  {standardCorrectCount} of {standardAnsweredCount} correct. Next,
                  use the patterns yourself in five English-to-Japanese
                  translations.
                </p>
              </div>
              <Button type="button" onClick={() => void beginTranslation()}>
                Start translation <ArrowRight className="size-4" />
              </Button>
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
