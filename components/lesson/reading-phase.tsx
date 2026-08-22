"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpenText, Languages } from "lucide-react";
import type { LessonPackage, StoryWord } from "@/types/lesson";
import type { LessonSession, ReadingEvent } from "@/types/lesson-session";
import { appendInspectableInteraction } from "@/lib/lesson-support";
import { japaneseInputPreview } from "@/lib/japanese-input";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { MultipleChoiceCard } from "@/components/exercises/multiple-choice-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";

export function ReadingPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const questions = lesson.readingQuestions ?? [];
  const answers = session.readingAnswers ?? [];
  const [typedAnswer, setTypedAnswer] = useState("");
  const currentIndex = Math.min(session.activityIndex, Math.max(0, questions.length - 1));
  const question = questions[currentIndex];
  const submitted = question
    ? answers.find((item) => item.questionId === question.id)
    : undefined;
  const convertedAnswer = japaneseInputPreview(typedAnswer);
  const choices = question?.choices?.filter((choice) => choice.trim().length > 0) ?? [];
  const multipleChoice = choices.length === 4;
  const answerCorrect = Boolean(
    submitted && question && normalizeAnswer(submitted.response) === normalizeAnswer(question.answer),
  );
  const complete = questions.length > 0 && answers.length >= questions.length;
  const terms = useMemo(
    () => uniqueTerms(
      lesson.readingConversation.flatMap((line) => line.inspectableTerms ?? []),
    ),
    [lesson.readingConversation],
  );

  function reveal(
    activityId: string,
    word: StoryWord,
    type: "reading" | "meaning",
  ) {
    const event: ReadingEvent = {
      id: `reading-help-${Date.now()}-${word.id}`,
      type: type === "reading" ? "reading-revealed" : "meaning-revealed",
      term: word.surface,
      confidence: "low",
      elapsedSeconds: session.elapsedSeconds,
    };
    const withInspection = appendInspectableInteraction(
      session,
      activityId,
      word,
      type,
    );
    onChange({
      ...withInspection,
      readingEvents: [...withInspection.readingEvents, event],
    });
  }

  function submit(selectedResponse?: string) {
    if (!question || submitted) return;
    const response = selectedResponse?.trim() || convertedAnswer || typedAnswer.trim();
    if (!response) return;
    const nextAnswers = [
      ...answers,
      { questionId: question.id, response },
    ];
    onChange({
      ...session,
      readingAnswers: nextAnswers,
      readingComplete: nextAnswers.length >= questions.length,
    });
  }

  function nextQuestion() {
    if (!submitted || currentIndex >= questions.length - 1) return;
    setTypedAnswer("");
    onChange({ ...session, activityIndex: currentIndex + 1 });
  }

  function completeLegacyReading() {
    onChange({ ...session, readingComplete: true });
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="max-w-2xl">
        <Badge tone="orange">Reading comprehension</Badge>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight">
          {lesson.readingJapaneseTitle || "Read for meaning."}
        </h2>
        <p className="mt-3 leading-7 text-stone-500">
          Read the passage carefully, then choose the best answer for each comprehension question.
        </p>
      </div>

      <Card className="mt-8 p-6 sm:p-9">
        <div className="mb-6 flex items-center gap-3 text-moss-700">
          <BookOpenText className="size-5" />
          <p className="text-sm font-bold uppercase tracking-[.18em]">Reading passage</p>
        </div>
        <div className="space-y-6">
          {lesson.readingConversation.map((line, index) => (
            <p
              key={`${line.speaker}-${index}`}
              className="text-justify font-serif text-xl leading-10 text-ink [text-justify:inter-character]"
            >
              <InspectableText
                text={line.japanese}
                terms={line.inspectableTerms ?? terms}
                onReveal={(word, type) =>
                  reveal(`reading-passage:${index}`, word, type)
                }
              />
            </p>
          ))}
        </div>
      </Card>

      {questions.length > 0 ? (
        <section className="mt-8" aria-labelledby="reading-question-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <Badge tone={difficultyTone(question.difficulty)}>{question.difficulty}</Badge>
              <h3 id="reading-question-title" className="mt-3 text-2xl font-semibold">
                Question {currentIndex + 1}
              </h3>
            </div>
            <p className="text-sm font-semibold text-stone-500">
              {answers.length} / {questions.length}
            </p>
          </div>
          <ProgressBar value={(answers.length / questions.length) * 100} className="mt-4" />

          <Card className="mt-6 p-6 sm:p-8">
            {multipleChoice ? (
              <MultipleChoiceCard
                prompt="Choose the best answer."
                cue={question.question}
                choices={choices}
                correctAnswer={question.answer}
                explanation={`The correct answer is ${question.answer}.`}
                selectedAnswer={submitted?.response}
                answered={Boolean(submitted)}
                answerCorrect={answerCorrect}
                lockAfterAnswer
                inspectChoices={false}
                inspectableTerms={terms}
                onInspect={(word, type) => reveal(question.id, word, type)}
                onSelect={(choice) => submit(choice)}
                answerAction={
                  submitted && currentIndex < questions.length - 1 ? (
                    <Button type="button" className="h-full min-h-14 px-5" onClick={nextQuestion}>
                      Next <ArrowRight className="size-4" />
                    </Button>
                  ) : null
                }
              />
            ) : (
              <>
                <p className="font-serif text-xl leading-9">
                  <InspectableText
                    text={question.question}
                    terms={terms}
                    onReveal={(word, type) =>
                      reveal(question.id, word, type)
                    }
                  />
                </p>
                <label className="mt-7 block text-sm font-semibold text-stone-600" htmlFor="reading-answer">
                  日本語で答えてください
                </label>
                <textarea
                  id="reading-answer"
                  rows={3}
                  value={submitted?.response ?? typedAnswer}
                  disabled={Boolean(submitted)}
                  onChange={(event) => setTypedAnswer(event.target.value)}
                  placeholder="短い文で答えてください"
                  className="mt-2 w-full resize-none rounded-2xl border border-stone-200 bg-white px-4 py-3 font-serif text-lg leading-8 outline-none transition focus:border-moss-500 focus:ring-4 focus:ring-moss-100 disabled:bg-stone-50"
                />

                {!submitted && convertedAnswer && convertedAnswer !== typedAnswer && (
                  <div className="mt-3 rounded-2xl border border-moss-100 bg-moss-50 p-4" role="status">
                    <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-moss-600">
                      <Languages className="size-4" /> Japanese input preview
                    </p>
                    <p className="mt-2 font-serif text-xl leading-8">{convertedAnswer}</p>
                  </div>
                )}

                {!submitted ? (
                  <Button
                    type="button"
                    className="mt-5"
                    disabled={!typedAnswer.trim()}
                    onClick={() => submit()}
                  >
                    Save answer
                  </Button>
                ) : currentIndex < questions.length - 1 ? (
                  <div className="mt-5 flex justify-end">
                    <Button type="button" onClick={nextQuestion}>
                      Next <ArrowRight className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Card>
        </section>
      ) : (
        <Button type="button" className="mt-7" disabled={session.readingComplete} onClick={completeLegacyReading}>
          {session.readingComplete ? "Reading complete" : "Finish reading"}
        </Button>
      )}

      {(complete || session.readingComplete) && (
        <details className="mt-8 rounded-3xl border border-stone-200 bg-white p-6">
          <summary className="cursor-pointer font-semibold text-moss-800">View English translation</summary>
          <div className="mt-5 space-y-4 text-justify leading-8 text-stone-600">
            {lesson.readingConversation.map((line, index) => (
              <p key={`translation-${index}`}>{line.english}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function normalizeAnswer(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function uniqueTerms(terms: StoryWord[]): StoryWord[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = `${term.libraryId ?? term.id}:${term.surface}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function difficultyTone(difficulty: "easy" | "medium" | "hard") {
  if (difficulty === "easy") return "moss" as const;
  if (difficulty === "hard") return "orange" as const;
  return "neutral" as const;
}
