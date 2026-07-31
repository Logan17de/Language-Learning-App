"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import type { LessonPackage, StoryWord } from "@/types/lesson";
import type {
  LessonSession,
  StoryInteraction,
} from "@/types/lesson-session";
import {
  segmentStoredStoryLine,
  STORY_MEANING_PENALTY,
  STORY_RECOGNITION_PENALTY,
} from "@/lib/story-support";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ActiveWordSupport {
  lineId: string;
  word: StoryWord;
  x: number;
  y: number;
  placement: "above" | "below";
  width: number;
}

export function StoryPhase({
  lesson,
  session,
  onChange,
}: {
  lesson: LessonPackage;
  session: LessonSession;
  onChange: (session: LessonSession) => void;
}) {
  const interactionCounter = useRef(session.storyInteractions.length);
  const supportRef = useRef<HTMLDivElement | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const [activeSupport, setActiveSupport] =
    useState<ActiveWordSupport | null>(null);
  const [supportClosing, setSupportClosing] = useState(false);

  const dismissSupport = useCallback(() => {
    if (!activeSupport || supportClosing) return;
    setSupportClosing(true);
    dismissTimerRef.current = window.setTimeout(() => {
      setActiveSupport(null);
      setSupportClosing(false);
      dismissTimerRef.current = null;
    }, 140);
  }, [activeSupport, supportClosing]);

  useEffect(() => {
    if (!activeSupport) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (supportRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        target.closest("[data-word-support-trigger]")
      ) {
        return;
      }
      dismissSupport();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissSupport();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeSupport, dismissSupport]);

  useEffect(
    () => () => {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    },
    [],
  );

  function addInteraction(interaction: Omit<StoryInteraction, "id">) {
    interactionCounter.current += 1;
    const next: StoryInteraction = {
      ...interaction,
      id: `${interaction.type}_${interactionCounter.current}`,
    };
    onChange({
      ...session,
      storyInteractions: [...session.storyInteractions, next],
    });
  }

  function evidenceFor(lineId: string, word: StoryWord) {
    return session.storyInteractions.filter(
      (item) =>
        item.lineId === lineId &&
        (item.wordId === word.id ||
          (!item.wordId && item.term === word.surface)),
    );
  }

  function anchorSupport(
    lineId: string,
    word: StoryWord,
    target: HTMLElement,
  ): ActiveWordSupport {
    const rect = target.getBoundingClientRect();
    const width = Math.min(288, Math.max(180, window.innerWidth - 32));
    const halfWidth = width / 2;
    const x = Math.max(
      16 + halfWidth,
      Math.min(
        window.innerWidth - 16 - halfWidth,
        rect.left + rect.width / 2,
      ),
    );
    const placeAbove =
      rect.bottom + 190 > window.innerHeight && rect.top > 190;

    return {
      lineId,
      word,
      x,
      y: placeAbove ? rect.top - 12 : rect.bottom + 12,
      placement: placeAbove ? "above" : "below",
      width,
    };
  }

  function revealWord(
    lineId: string,
    word: StoryWord,
    target: HTMLElement,
  ) {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setSupportClosing(false);
    const interactions = evidenceFor(lineId, word);
    const readingRevealed = interactions.some(
      (item) => item.type === "reading-revealed",
    );
    const meaningRevealed = interactions.some(
      (item) => item.type === "meaning-revealed",
    );
    const kana = word.scriptType !== "kanji";
    const sameWordIsOpen =
      activeSupport?.lineId === lineId && activeSupport.word.id === word.id;

    if (meaningRevealed && (kana || readingRevealed)) {
      setActiveSupport(
        sameWordIsOpen ? null : anchorSupport(lineId, word, target),
      );
      return;
    }

    setActiveSupport(anchorSupport(lineId, word, target));

    if (kana && !meaningRevealed) {
      addInteraction({
        lineId,
        wordId: word.id,
        term: word.surface,
        type: "meaning-revealed",
        scoreDelta: -STORY_MEANING_PENALTY,
        meaningDelta: -STORY_MEANING_PENALTY,
        recognitionDelta: -STORY_MEANING_PENALTY,
        pronunciationDelta: 0,
        script: "kana",
      });
      return;
    }

    if (!kana && !readingRevealed) {
      addInteraction({
        lineId,
        wordId: word.id,
        term: word.surface,
        type: "reading-revealed",
        scoreDelta: -STORY_RECOGNITION_PENALTY,
        meaningDelta: 0,
        recognitionDelta: -STORY_RECOGNITION_PENALTY,
        pronunciationDelta: 0,
        script: "kanji",
      });
      return;
    }

    if (!meaningRevealed) {
      addInteraction({
        lineId,
        wordId: word.id,
        term: word.surface,
        type: "meaning-revealed",
        scoreDelta: -STORY_MEANING_PENALTY,
        meaningDelta: -STORY_MEANING_PENALTY,
        recognitionDelta: 0,
        pronunciationDelta: 0,
        script: "kanji",
      });
    }
  }

  function wordSupport(lineId: string, word: StoryWord) {
    const interactions = evidenceFor(lineId, word);
    const readingRevealed = interactions.some(
      (item) => item.type === "reading-revealed",
    );
    const meaningRevealed = interactions.some(
      (item) => item.type === "meaning-revealed",
    );
    return {
      reading:
        word.scriptType === "kanji" && readingRevealed
          ? word.reading
          : undefined,
      meaning: meaningRevealed ? word.meaning : undefined,
      touched: readingRevealed || meaningRevealed,
    };
  }

  const helpedWords = new Set(
    session.storyInteractions
      .filter(
        (item) =>
          item.type === "reading-revealed" ||
          item.type === "meaning-revealed",
      )
      .map(
        (item) =>
          item.wordId ?? `${item.lineId}:${item.term ?? "unknown"}`,
      ),
  ).size;
  const availableWords = lesson.story.reduce(
    (total, line) => total + line.words.length,
    0,
  );
  const storyParagraphs: LessonPackage["story"][] = [];
  for (let index = 0; index < lesson.story.length; index += 2) {
    storyParagraphs.push(lesson.story.slice(index, index + 2));
  }
  const activeDetails = activeSupport
    ? wordSupport(activeSupport.lineId, activeSupport.word)
    : null;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge>Story first</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            {lesson.japaneseTitle}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">
            Read naturally and touch a word only when you need help. Kanji
            reveals its hiragana first and meaning on the next touch. Kana
            reveals meaning immediately.
          </p>
        </div>
        <div className="rounded-2xl border border-moss-100 bg-moss-50 px-4 py-3 text-xs text-moss-800">
          <p className="font-semibold">{availableWords} stored words</p>
          <p className="mt-1 text-moss-600">
            Help used on {helpedWords} {helpedWords === 1 ? "word" : "words"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm text-stone-600">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-persimmon-500" />
        <p>
          Meaning, recognition, and pronunciation are tracked separately.
          Reading help changes recognition; meaning help changes meaning. For
          kana, one meaning reveal changes meaning and recognition together.
          Pronunciation remains independent for reading and speaking practice.
        </p>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {lesson.images.map((image, index) => (
          <div
            key={image.id}
            className={`relative overflow-hidden rounded-3xl p-6 ${
              image.accent === "moss"
                ? "bg-moss-900 text-white"
                : "bg-persimmon-100 text-ink"
            }`}
          >
            <div className="absolute -right-7 -top-7 size-32 rounded-full bg-white/10" />
            <ImageIcon className="size-5 opacity-60" />
            <p className="mt-14 max-w-xs font-serif text-xl">
              {image.description}
            </p>
            <p className="mt-2 text-xs opacity-50">
              Scene {index + 1} · lesson illustration
            </p>
          </div>
        ))}
      </div>

      <Card className="mt-8 p-6 sm:p-10">
        <div className="space-y-8">
          {storyParagraphs.map((paragraph, paragraphIndex) => (
            <p
              key={`story_paragraph_${paragraphIndex}`}
              className="font-serif text-xl leading-[3.4rem] text-ink sm:text-2xl"
            >
              {paragraph.map((line) => (
                <span key={line.id}>
                  {segmentStoredStoryLine(line.japanese, line.words).map(
                    (segment, segmentIndex) => {
                      if (!segment.word) {
                        return (
                          <span key={`${line.id}_text_${segmentIndex}`}>
                            {segment.text}
                          </span>
                        );
                      }
                      const word = segment.word;
                      const support = wordSupport(line.id, word);
                      const isOpen =
                        activeSupport?.lineId === line.id &&
                        activeSupport.word.id === word.id;
                      return (
                        <button
                          key={word.id}
                          type="button"
                          onClick={(event) =>
                            revealWord(line.id, word, event.currentTarget)
                          }
                          className={`inline appearance-none border-x-0 border-t-0 bg-transparent p-0 align-baseline font-serif text-inherit leading-[inherit] transition focus:outline-none focus:ring-2 focus:ring-moss-200 ${
                            isOpen
                              ? "border-b-2 border-solid border-persimmon-400 text-persimmon-600"
                              : support.touched
                                ? "border-b-2 border-dotted border-persimmon-300 text-ink"
                                : "border-b-2 border-dotted border-stone-300 text-ink hover:border-moss-500"
                          }`}
                          aria-label={`Get help with ${word.surface}`}
                          aria-expanded={isOpen}
                          data-word-support-trigger
                        >
                          {word.surface}
                        </button>
                      );
                    },
                  )}
                </span>
              ))}
            </p>
          ))}
        </div>

        <div className="mt-10 border-t border-stone-200 pt-8">
          <p className="section-kicker">English story</p>
          <div className="mt-4 space-y-4">
            {lesson.story.map((line) => (
              <p
                key={`${line.id}_english`}
                className="text-base leading-7 text-stone-600 sm:text-lg"
              >
                {line.english}
              </p>
            ))}
          </div>
        </div>
      </Card>

      {activeSupport && activeDetails && (
        <div
          ref={supportRef}
          role="dialog"
          aria-label={`Help for ${activeSupport.word.surface}`}
          className={`fixed z-50 overflow-visible rounded-2xl border border-moss-700 bg-moss-900 text-white shadow-2xl transition duration-150 ease-out ${
            supportClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
          }`}
          style={{
            left: activeSupport.x,
            top: activeSupport.y,
            width: activeSupport.width,
            transform:
              activeSupport.placement === "above"
                ? "translate(-50%, -100%)"
                : "translateX(-50%)",
          }}
        >
          <span
            className={`absolute left-1/2 size-4 -translate-x-1/2 rotate-45 border-moss-700 bg-moss-900 ${
              activeSupport.placement === "above"
                ? "-bottom-2 border-b border-r"
                : "-top-2 border-l border-t"
            }`}
            aria-hidden="true"
          />
          {activeDetails.reading && (
            <div className="relative border-b border-white/15 px-5 py-3 text-center text-lg font-semibold text-persimmon-200">
              {activeDetails.reading}
            </div>
          )}
          {activeDetails.meaning && (
            <div className="relative px-5 py-5 text-center">
              <p className="text-xl font-medium leading-snug">
                {activeDetails.meaning}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="mt-7 rounded-3xl border border-moss-200 bg-moss-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {session.storyComplete ? (
            <Check className="size-5 text-moss-700" />
          ) : (
            <BookOpen className="size-5 text-moss-700" />
          )}
          <div className="flex-1">
            <p className="font-semibold">
              {session.storyComplete
                ? "Story explored"
                : "Finished reading the story?"}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Your word-support choices are saved and will shape review.
            </p>
          </div>
          {!session.storyComplete && (
            <Button
              type="button"
              onClick={() =>
                onChange({ ...session, storyComplete: true })
              }
            >
              Finish story
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
