"use client";

import { useRef, useState } from "react";
import { BookOpen, Check, Headphones, Image as ImageIcon, Languages, Volume2 } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession, StoryInteraction } from "@/types/lesson-session";
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
  const [showEnglish, setShowEnglish] = useState(false);
  const [playingLine, setPlayingLine] = useState<string | null>(null);
  const interactionCounter = useRef(session.storyInteractions.length);

  function addInteraction(interaction: Omit<StoryInteraction, "id">) {
    interactionCounter.current += 1;
    const next: StoryInteraction = { ...interaction, id: `${interaction.type}_${interactionCounter.current}` };
    onChange({ ...session, storyInteractions: [...session.storyInteractions, next] });
  }

  function playLine(lineId: string) {
    setPlayingLine(lineId);
    addInteraction({ lineId, type: "audio-played" });
    window.setTimeout(() => setPlayingLine(null), 1300);
  }

  function revealTerm(lineId: string, term: string) {
    const interactions = session.storyInteractions.filter((item) => item.lineId === lineId && item.term === term);
    const revealCount = interactions.filter((item) => item.type === "reading-revealed" || item.type === "meaning-revealed").length;
    addInteraction({
      lineId,
      term,
      type: revealCount === 0 ? "reading-revealed" : "meaning-revealed",
    });
  }

  function termSupport(lineId: string, term: string): { reading?: string; meaning?: string } {
    const count = session.storyInteractions.filter(
      (item) => item.lineId === lineId && item.term === term && (item.type === "reading-revealed" || item.type === "meaning-revealed"),
    ).length;
    const vocabulary = lesson.vocabulary.find((item) => item.term === term || item.term.startsWith(term));
    const kanji = lesson.kanji.find((item) => item.character === term || term.includes(item.character));
    const reading = vocabulary?.reading ?? kanji?.reading ?? supportDictionary[term]?.reading ?? "よみ";
    const meaning = vocabulary?.meaning ?? kanji?.meaning ?? supportDictionary[term]?.meaning ?? "story word";
    return {
      reading: count >= 1 ? reading : undefined,
      meaning: count >= 2 ? meaning : undefined,
    };
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge>Context first</Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">Yuki’s morning commute</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">Listen line by line. Tap a highlighted word once for its reading and again for its meaning.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setShowEnglish((value) => !value)}>
          <Languages className="size-4" />
          {showEnglish ? "Hide English" : "Show English"}
        </Button>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {lesson.images.map((image, index) => (
          <div key={image.id} className={`relative overflow-hidden rounded-3xl p-6 ${image.accent === "moss" ? "bg-moss-900 text-white" : "bg-persimmon-100 text-ink"}`}>
            <div className="absolute -right-7 -top-7 size-32 rounded-full bg-white/10" />
            <ImageIcon className="size-5 opacity-60" />
            <p className="mt-14 max-w-xs font-serif text-xl">{image.description}</p>
            <p className="mt-2 text-xs opacity-50">Scene {index + 1} · lesson illustration</p>
          </div>
        ))}
      </div>

      <div className="mt-7 space-y-4">
        {lesson.story.map((line, index) => (
          <Card key={line.id} className="p-5 sm:p-6">
            <div className="flex gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-moss-50 text-xs font-bold text-moss-700">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="font-serif text-xl leading-9 sm:text-2xl">{line.japanese}</p>
                {showEnglish && <p className="mt-2 text-sm leading-6 text-stone-500">{line.english}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  {line.tappableTerms.map((term) => {
                    const support = termSupport(line.id, term);
                    return (
                      <button key={term} type="button" onClick={() => revealTerm(line.id, term)} className="min-h-10 rounded-xl border border-moss-100 bg-moss-50 px-3 text-left text-xs transition hover:border-moss-300 focus:outline-none focus:ring-4 focus:ring-moss-100">
                        <span className="font-semibold text-moss-900">{term}</span>
                        {support.reading && <span className="ml-2 text-moss-600">{support.reading}</span>}
                        {support.meaning && <span className="ml-2 text-stone-500">· {support.meaning}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button type="button" onClick={() => playLine(line.id)} aria-label={`Play simulated audio for line ${index + 1}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-persimmon-50 text-persimmon-500 focus:outline-none focus:ring-4 focus:ring-persimmon-100">
                {playingLine === line.id ? <Volume2 className="size-5 animate-pulse" /> : <Headphones className="size-5" />}
              </button>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-7 rounded-3xl border border-moss-200 bg-moss-50 p-5">
        <div className="flex items-center gap-3">
          {session.storyComplete ? <Check className="size-5 text-moss-700" /> : <BookOpen className="size-5 text-moss-700" />}
          <div className="flex-1">
            <p className="font-semibold">{session.storyComplete ? "Story explored" : "Ready to practice the key words?"}</p>
            <p className="mt-1 text-xs text-stone-500">{session.storyInteractions.length} story interactions saved locally</p>
          </div>
          {!session.storyComplete && (
            <Button type="button" onClick={() => onChange({ ...session, storyComplete: true })}>Continue to Vocabulary</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const supportDictionary: Record<string, { reading: string; meaning: string }> = {
  "朝": { reading: "あさ", meaning: "morning" },
  "最近": { reading: "さいきん", meaning: "recently" },
  "早く": { reading: "はやく", meaning: "early" },
  "飲み": { reading: "のみ", meaning: "drink" },
  "読み": { reading: "よみ", meaning: "read" },
  "家": { reading: "いえ", meaning: "home" },
  "出": { reading: "で", meaning: "leave" },
  "聞き": { reading: "きき", meaning: "listen" },
  "歩き": { reading: "あるき", meaning: "walk" },
  "同僚": { reading: "どうりょう", meaning: "colleague" },
  "会い": { reading: "あい", meaning: "meet" },
  "電車": { reading: "でんしゃ", meaning: "train" },
  "乗り": { reading: "のり", meaning: "ride" },
  "新しい": { reading: "あたらしい", meaning: "new" },
  "仕事": { reading: "しごと", meaning: "work" },
  "慣れる": { reading: "なれる", meaning: "get used to" },
};
