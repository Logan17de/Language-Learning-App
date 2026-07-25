"use client";

import { useRef } from "react";
import {
  BookOpen,
  Check,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type {
  LessonSession,
  StoryInteraction,
} from "@/types/lesson-session";
import {
  isKanaOnly,
  segmentStoryLine,
  STORY_MEANING_PENALTY,
  STORY_READING_PENALTY,
  storyTermScore,
} from "@/lib/story-support";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

  function revealTerm(lineId: string, term: string) {
    const interactions = session.storyInteractions.filter(
      (item) => item.lineId === lineId && item.term === term,
    );
    const readingRevealed = interactions.some(
      (item) => item.type === "reading-revealed",
    );
    const meaningRevealed = interactions.some(
      (item) => item.type === "meaning-revealed",
    );
    const kana = isKanaOnly(term);

    if (kana && !meaningRevealed) {
      addInteraction({
        lineId,
        term,
        type: "meaning-revealed",
        scoreDelta: -STORY_MEANING_PENALTY,
        script: "kana",
      });
      return;
    }
    if (!kana && !readingRevealed) {
      addInteraction({
        lineId,
        term,
        type: "reading-revealed",
        scoreDelta: -STORY_READING_PENALTY,
        script: "kanji",
      });
      return;
    }
    if (!meaningRevealed) {
      addInteraction({
        lineId,
        term,
        type: "meaning-revealed",
        scoreDelta: -STORY_MEANING_PENALTY,
        script: kana ? "kana" : "kanji",
      });
    }
  }

  function termSupport(lineId: string, term: string) {
    const interactions = session.storyInteractions.filter(
      (item) => item.lineId === lineId && item.term === term,
    );
    const vocabulary = lesson.vocabulary.find(
      (item) => item.term === term || item.term.startsWith(term),
    );
    const kanji = lesson.kanji.find(
      (item) => item.character === term || term.includes(item.character),
    );
    const dictionary = supportDictionary[term];
    return {
      reading: interactions.some(
        (item) => item.type === "reading-revealed",
      )
        ? (vocabulary?.reading ?? kanji?.reading ?? dictionary?.reading)
        : undefined,
      meaning: interactions.some(
        (item) => item.type === "meaning-revealed",
      )
        ? (vocabulary?.meaning ?? kanji?.meaning ?? dictionary?.meaning)
        : undefined,
      touched: interactions.some(
        (item) =>
          item.type === "reading-revealed" ||
          item.type === "meaning-revealed",
      ),
      score: storyTermScore(session.storyInteractions, lineId, term),
    };
  }

  const helpedWords = new Set(
    session.storyInteractions
      .filter(
        (item) =>
          item.term &&
          (item.type === "reading-revealed" ||
            item.type === "meaning-revealed"),
      )
      .map((item) => `${item.lineId}:${item.term}`),
  ).size;

  function tappableTermsFor(line: LessonPackage["story"][number]) {
    const candidates = [
      ...line.tappableTerms,
      ...lesson.vocabulary.map((item) => item.term),
      ...lesson.kanji.map((item) => item.character),
      ...Object.keys(supportDictionary),
    ];
    return Array.from(
      new Set(
        candidates.filter(
          (term) => term.length > 0 && line.japanese.includes(term),
        ),
      ),
    ).sort((left, right) => right.length - left.length);
  }

  const availableWords = lesson.story.reduce(
    (total, line) => total + tappableTermsFor(line).length,
    0,
  );
  const storyParagraphs: LessonPackage["story"][] = [];
  for (let index = 0; index < lesson.story.length; index += 2) {
    storyParagraphs.push(lesson.story.slice(index, index + 2));
  }

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
            reveals its hiragana first and meaning second; kana reveals meaning
            immediately.
          </p>
        </div>
        <div className="rounded-2xl border border-moss-100 bg-moss-50 px-4 py-3 text-xs text-moss-800">
          <p className="font-semibold">{availableWords} tappable words</p>
          <p className="mt-1 text-moss-600">
            Help used on {helpedWords} {helpedWords === 1 ? "word" : "words"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm text-stone-600">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-persimmon-500" />
        <p>
          Every word begins at <strong>100 independence points</strong>.
          Reading help costs {STORY_READING_PENALTY}; meaning help costs{" "}
          {STORY_MEANING_PENALTY}. This changes that word’s review priority,
          not your right to continue.
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
              {paragraph.map((line, lineIndex) => (
                <span key={line.id}>
                  {segmentStoryLine(
                    line.japanese,
                    tappableTermsFor(line),
                  ).map((segment, segmentIndex) => {
                    if (!segment.term) {
                      return (
                        <span key={`${line.id}_text_${segmentIndex}`}>
                          {segment.text}
                        </span>
                      );
                    }
                    const support = termSupport(line.id, segment.term);
                    return (
                      <button
                        key={`${line.id}_term_${segmentIndex}`}
                        type="button"
                        onClick={() => revealTerm(line.id, segment.term!)}
                        className={`relative mx-0.5 inline-flex min-h-11 flex-col items-center justify-center rounded-xl border px-2 align-middle font-sans text-base leading-tight transition focus:outline-none focus:ring-4 focus:ring-moss-100 sm:text-lg ${
                          support.touched
                            ? "border-persimmon-200 bg-persimmon-50 text-ink"
                            : "border-transparent bg-moss-50/70 text-moss-900 hover:border-moss-300"
                        }`}
                        aria-label={`Get help with ${segment.term}`}
                      >
                        {support.reading && (
                          <span className="text-[11px] font-semibold text-moss-600">
                            {support.reading}
                          </span>
                        )}
                        <span className="font-semibold">{segment.term}</span>
                        {support.meaning && (
                          <span className="max-w-36 text-[10px] text-stone-500">
                            {support.meaning}
                          </span>
                        )}
                        {support.touched && (
                          <span className="text-[9px] font-bold text-persimmon-600">
                            {support.score}/100
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {lineIndex < paragraph.length - 1 && (
                    <span className="inline-block w-3" aria-hidden="true" />
                  )}
                </span>
              ))}
            </p>
          ))}
        </div>
      </Card>

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

const supportDictionary: Record<
  string,
  { reading: string; meaning: string }
> = {
  朝: { reading: "あさ", meaning: "morning" },
  ゆきさん: { reading: "ゆきさん", meaning: "Yuki" },
  は: { reading: "は", meaning: "topic marker" },
  六時半: { reading: "ろくじはん", meaning: "6:30" },
  に: { reading: "に", meaning: "at / to" },
  起きます: { reading: "おきます", meaning: "wake up" },
  コーヒー: { reading: "コーヒー", meaning: "coffee" },
  を: { reading: "を", meaning: "object marker" },
  飲み: { reading: "のみ", meaning: "drink" },
  ながら: { reading: "ながら", meaning: "while doing" },
  ニュース: { reading: "ニュース", meaning: "news" },
  読みます: { reading: "よみます", meaning: "read" },
  音楽: { reading: "おんがく", meaning: "music" },
  聞き: { reading: "きき", meaning: "listen" },
  駅: { reading: "えき", meaning: "station" },
  まで: { reading: "まで", meaning: "until / as far as" },
  歩きます: { reading: "あるきます", meaning: "walk" },
  改札: { reading: "かいさつ", meaning: "ticket gate" },
  で: { reading: "で", meaning: "at / by means of" },
  同僚: { reading: "どうりょう", meaning: "colleague" },
  の: { reading: "の", meaning: "possessive marker" },
  田中さん: { reading: "たなかさん", meaning: "Mr. Tanaka" },
  会います: { reading: "あいます", meaning: "meet" },
  最近: { reading: "さいきん", meaning: "recently" },
  早く: { reading: "はやく", meaning: "early" },
  家: { reading: "いえ", meaning: "home" },
  出: { reading: "で", meaning: "leave" },
  歩き: { reading: "あるき", meaning: "walk" },
  会い: { reading: "あい", meaning: "meet" },
  電車: { reading: "でんしゃ", meaning: "train" },
  乗り: { reading: "のり", meaning: "ride" },
  新しい: { reading: "あたらしい", meaning: "new" },
  仕事: { reading: "しごと", meaning: "work" },
  慣れる: { reading: "なれる", meaning: "get used to" },
};
