"use client";

import { Check, Circle } from "lucide-react";
import type { StoryWord } from "@/types/lesson";
import { cn } from "@/lib/utils";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { AnswerFeedback } from "@/components/exercises/answer-feedback";

export function MultipleChoiceCard({
  prompt,
  cue,
  choices,
  selectedAnswer,
  correctAnswer,
  explanation,
  answered,
  answerCorrect,
  lockAfterAnswer = false,
  disabled = false,
  inspectableTerms = [],
  inspectChoices = true,
  onInspect,
  onSelect,
}: {
  prompt: string;
  cue?: string;
  choices: string[];
  selectedAnswer?: string;
  correctAnswer: string;
  explanation: string;
  answered: boolean;
  answerCorrect?: boolean;
  lockAfterAnswer?: boolean;
  disabled?: boolean;
  inspectableTerms?: StoryWord[];
  inspectChoices?: boolean;
  onInspect?: (word: StoryWord, reveal: "reading" | "meaning") => void;
  onSelect: (answer: string) => void;
}) {
  const isCorrect = answerCorrect ?? selectedAnswer === correctAnswer;
  const locked = disabled || (answered && lockAfterAnswer);

  return (
    <section aria-labelledby="question-prompt">
      <p id="question-prompt" className="text-sm font-semibold text-stone-500">
        <InspectableText text={prompt} terms={inspectableTerms} onReveal={onInspect} />
      </p>
      {cue && (
        <p className="mt-5 font-serif text-3xl font-semibold leading-relaxed text-ink sm:text-4xl">
          <InspectableText text={cue} terms={inspectableTerms} onReveal={onInspect} />
        </p>
      )}
      <div className="mt-7 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={prompt}>
        {choices.map((choice, index) => {
          const selected = selectedAnswer === choice;
          const correctChoice = answered && choice === correctAnswer;
          const wrongChoice = answered && selected && !correctChoice;
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={locked}
              onClick={() => onSelect(choice)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-2xl border bg-white p-4 text-left text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-moss-100 disabled:cursor-default",
                correctChoice && "border-moss-500 bg-moss-50 text-moss-900",
                wrongChoice && "border-persimmon-400 bg-persimmon-50 text-persimmon-600",
                !correctChoice && !wrongChoice && selected && "border-moss-600",
                !selected && !correctChoice && !locked && "border-stone-200 hover:border-moss-300",
                !selected && !correctChoice && locked && "border-stone-200 opacity-55",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-current/20 text-xs">
                {correctChoice ? <Check className="size-4" /> : selected ? <Circle className="size-3 fill-current" /> : String.fromCharCode(65 + index)}
              </span>
              {inspectChoices ? (
                <InspectableText text={choice} terms={inspectableTerms} onReveal={onInspect} />
              ) : (
                <span>{choice}</span>
              )}
            </button>
          );
        })}
      </div>
      {answered && selectedAnswer && <div className="mt-5"><AnswerFeedback correct={isCorrect} explanation={explanation} /></div>}
    </section>
  );
}
