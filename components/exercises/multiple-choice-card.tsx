"use client";

import type { ReactNode } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type { StoryWord } from "@/types/lesson";
import { cn } from "@/lib/utils";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { AnswerFeedback } from "@/components/exercises/answer-feedback";

/**
 * One question, asked on the left and answered on the right.
 *
 * The two sides do different work and are read at different speeds. The
 * question is read once, carefully, so it gets room and the largest type. The
 * choices are scanned and rescanned, so they are a single tight column of
 * full-width targets rather than a grid the eye has to traverse in two
 * directions. Stacking them, as this did before, pushed the choices below the
 * fold on the longer Japanese prompts and left the answer the learner just gave
 * far from the button that moves them on.
 *
 * Below `lg` the columns become one, question first: on a phone the reading
 * order is the only order there is.
 *
 * The question deliberately does not stick. A card this short never scrolls far
 * enough to lose it, and pinning it only let it drift away from the answers it
 * belongs to, leaving a gap where the pairing should be.
 */
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
  answerAction,
  aside,
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
  answerAction?: ReactNode;
  /** Extra context that belongs with the question, such as a passage excerpt. */
  aside?: ReactNode;
  onInspect?: (word: StoryWord, reveal: "reading" | "meaning") => void;
  onSelect: (answer: string) => void;
}) {
  const isCorrect = answerCorrect ?? selectedAnswer === correctAnswer;
  const locked = disabled || (answered && lockAfterAnswer);
  // A question with no cue stores an empty string, not null, so these must be
  // tested for content rather than for being present. Falling back with `??`
  // let "" through as the lead and left the whole ask column blank.
  const cueText = cue?.trim() ? cue : "";
  const promptText = prompt?.trim() ? prompt : "";
  // Questions that carry no separate cue would otherwise lead with label-sized
  // text, so the prompt takes the lead voice instead.
  const leadText = cueText || promptText;
  const supportText = cueText ? promptText : "";

  return (
    <section
      className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12"
      aria-labelledby="question-prompt"
    >
      {answered && selectedAnswer && isCorrect && (
        <div
          key={selectedAnswer}
          className="answer-celebration pointer-events-none absolute -right-2 -top-3 z-10 size-24"
          aria-hidden="true"
          data-answer-celebration
        >
          <Sparkles className="answer-celebration-core absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 text-persimmon-500" />
          <span className="answer-celebration-spark left-2 top-2" />
          <span className="answer-celebration-spark right-1 top-5 [animation-delay:70ms]" />
          <span className="answer-celebration-spark bottom-2 right-4 [animation-delay:120ms]" />
          <span className="answer-celebration-spark bottom-4 left-1 [animation-delay:160ms]" />
        </div>
      )}

      {/* Ask */}
      <div>
        {supportText && (
          <p className="text-sm font-semibold text-muted">
            <InspectableText
              text={supportText}
              terms={inspectableTerms}
              onReveal={onInspect}
            />
          </p>
        )}
        {leadText && (
          <p
            id="question-prompt"
            className={cn(
              "font-serif font-semibold leading-relaxed text-ink",
              supportText ? "mt-4" : "",
              cueText ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
            )}
          >
            <InspectableText
              text={leadText}
              terms={inspectableTerms}
              onReveal={onInspect}
            />
          </p>
        )}
        {aside && <div className="mt-6">{aside}</div>}
      </div>

      {/* Answer */}
      <div className="min-w-0">
        <div
          className="flex flex-col gap-2.5"
          role="radiogroup"
          aria-label={leadText || supportText}
        >
          {choices.map((choice, index) => {
            const selected = selectedAnswer === choice;
            const correctChoice = answered && choice === correctAnswer;
            const wrongChoice = answered && selected && !correctChoice;
            const receded = locked && !selected && !correctChoice;
            return (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => onSelect(choice)}
                style={{ animationDelay: `${Math.min(index, 5) * 45}ms` }}
                className={cn(
                  "choice-option group/choice relative flex min-h-16 items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left text-base font-semibold text-ink",
                  "transition-[transform,border-color,background-color,box-shadow] duration-200 ease-out",
                  "focus:outline-none focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                  "disabled:cursor-default",
                  correctChoice &&
                    "answer-choice-correct border-correct-border bg-correct-surface text-correct-ink",
                  wrongChoice &&
                    "answer-choice-wrong border-wrong-border bg-wrong-surface text-wrong-ink",
                  !correctChoice && !wrongChoice && selected && "border-moss-600 bg-surface",
                  !selected &&
                    !correctChoice &&
                    !locked &&
                    "border-border bg-surface hover:-translate-y-0.5 hover:border-moss-400 hover:bg-surface-muted hover:shadow-soft active:translate-y-0 active:scale-[0.995]",
                  receded && "choice-receded border-border bg-surface",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-xl border text-xs font-bold transition-colors duration-200",
                    correctChoice && "border-correct-border bg-moss-500 text-white",
                    wrongChoice && "border-wrong-border bg-persimmon-500 text-white",
                    !correctChoice &&
                      !wrongChoice &&
                      "border-border bg-surface-muted text-muted group-hover/choice:border-moss-300 group-hover/choice:text-moss-700",
                  )}
                  aria-hidden="true"
                >
                  {correctChoice ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : wrongChoice ? (
                    <X className="size-4" strokeWidth={3} />
                  ) : (
                    String.fromCharCode(65 + index)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {inspectChoices ? (
                    <InspectableText
                      text={choice}
                      terms={inspectableTerms}
                      onReveal={onInspect}
                    />
                  ) : (
                    choice
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {answered && selectedAnswer && (
          <div className="answer-result-row mt-5" data-answer-result-row>
            <AnswerFeedback correct={isCorrect} explanation={explanation} />
            {answerAction && (
              <div className="mt-4 [&>*]:w-full sm:[&>*]:w-auto">{answerAction}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
