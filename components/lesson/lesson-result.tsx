"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  Clock3,
  Flame,
  PartyPopper,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
} from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonCompletionResult } from "@/types/lesson-session";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { LessonReportDialog } from "@/components/support/lesson-report-dialog";

export function LessonResult({
  lesson,
  result,
}: {
  lesson: LessonPackage;
  result: LessonCompletionResult;
}) {
  const rewardLessonCompletion = useAppStore(
    (state) => state.rewardLessonCompletion,
  );
  const rewarded = useAppStore(
    (state) => state.lessonSessions[lesson.id]?.rewarded ?? false,
  );
  const streak = useAppStore((state) => state.user.streakDays);
  const [showMistakes, setShowMistakes] = useState(false);

  useEffect(() => {
    rewardLessonCompletion(lesson, result);
  }, [lesson, result, rewardLessonCompletion]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-paper px-5 py-10 sm:px-8 sm:py-16">
      <div
        className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        aria-hidden="true"
      >
        {[
          "left-[12%] top-16",
          "left-[25%] top-32",
          "right-[18%] top-20",
          "right-[30%] top-44",
        ].map((position, index) => (
          <span
            key={position}
            className={`absolute ${position} animate-float-slow ${index % 2 ? "text-moss-500" : "text-persimmon-400"}`}
          >
            {index % 2 ? (
              <Star className="size-5 fill-current" />
            ) : (
              <Sparkles className="size-6" />
            )}
          </span>
        ))}
      </div>
      <div className="relative mx-auto max-w-4xl">
        <div className="text-center">
          <span className="mx-auto grid size-24 place-items-center rounded-[2.25rem] bg-moss-900 text-white shadow-float">
            <PartyPopper className="size-10 text-persimmon-400" />
          </span>
          <Badge tone="orange" className="mt-7">
            Lesson Complete
          </Badge>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {lesson.title}
          </h1>
          <p className="mt-3 font-serif text-xl text-stone-500">
            {lesson.japaneseTitle}
          </p>
          <div className="mt-8 flex items-end justify-center gap-2">
            <span className="text-7xl font-semibold tracking-tight text-moss-700">
              {result.score}
            </span>
            <span className="mb-2 text-2xl font-semibold text-stone-400">%</span>
          </div>
          <p className="mt-2 text-sm text-stone-500">
            {result.score >= 80
              ? "Strong performance across today’s lesson."
              : "A solid session with a few items to strengthen."}
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <ResultStat
            icon={Trophy}
            value={`+${result.xpGained}`}
            label="XP gained"
          />
          <ResultStat
            icon={Flame}
            value={`${streak} ${streak === 1 ? "day" : "days"}`}
            label="Current streak"
          />
          <ResultStat
            icon={Clock3}
            value={`${result.durationMinutes} min`}
            label="Lesson duration"
          />
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Card className="p-7">
            <h2 className="flex items-center gap-2 font-semibold">
              <BookOpenCheck className="size-5 text-moss-600" /> Today’s language
            </h2>
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                Kanji practiced
              </p>
              <div className="mt-2 flex gap-2">
                {lesson.kanji.map((item) => (
                  <span
                    key={item.character}
                    className="grid size-12 place-items-center rounded-2xl bg-moss-50 text-xl font-semibold"
                  >
                    {item.character}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                Grammar practiced
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {lesson.grammar.map((item) => (
                  <Badge key={item.id}>{item.pattern}</Badge>
                ))}
              </div>
            </div>
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-400">
                Needs attention
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                {result.weakItems.length
                  ? `Strengthen ${result.weakItems.join(" and ")} in future practice.`
                  : "No weak items were detected in this lesson."}
              </p>
            </div>
          </Card>
          <Card className="p-7">
            <h2 className="flex items-center gap-2 font-semibold">
              <Volume2 className="size-5 text-persimmon-500" /> Skill changes
            </h2>
            <div className="mt-6 space-y-5">
              <SkillChange
                label="Kanji recognition"
                value={72}
                change={result.recognitionChange}
              />
              <SkillChange
                label="Pronunciation confidence"
                value={66}
                change={result.pronunciationChange}
              />
              <SkillChange
                label="Grammar understanding"
                value={74}
                change={result.grammarUnderstandingChange}
              />
              <SkillChange
                label="Grammar production"
                value={59}
                change={result.grammarProductionChange}
              />
            </div>
          </Card>
        </div>

        <Card className="mt-6 p-6">
          <button
            type="button"
            onClick={() => setShowMistakes((value) => !value)}
            className="flex min-h-12 w-full items-center gap-3 text-left focus:outline-none focus:ring-4 focus:ring-moss-100"
          >
            <RotateCcw className="size-5 text-persimmon-500" />
            <div className="flex-1">
              <p className="font-semibold">Items to strengthen</p>
              <p className="text-xs text-stone-400">
                {result.weakItems.length} item
                {result.weakItems.length === 1 ? "" : "s"}
              </p>
            </div>
            <ChevronDown
              className={`size-5 text-stone-400 transition ${showMistakes ? "rotate-180" : ""}`}
            />
          </button>
          {showMistakes && (
            <div className="mt-4 border-t border-stone-100 pt-4">
              {result.weakItems.length ? (
                <div className="flex flex-wrap gap-2">
                  {result.weakItems.map((item) => (
                    <Badge key={item} tone="orange">
                      {item}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-moss-700">
                  <Check className="size-4" /> No weak items detected in this
                  lesson.
                </p>
              )}
            </div>
          )}
        </Card>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowMistakes(true)}
          >
            <RotateCcw className="size-4" /> See weak items
          </Button>
          <ButtonLink href="/home" variant="dark">
            Return Home
          </ButtonLink>
          <ButtonLink href={`/lesson/${lesson.id}/preview`}>
            Continue Learning <ArrowRight className="size-4" />
          </ButtonLink>
        </div>
        <div className="mt-5 flex justify-center">
          <LessonReportDialog
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            phase="Lesson results"
            compact
          />
        </div>
        <p className="mt-5 text-center text-xs text-stone-400">
          {rewarded
            ? "Rewards saved once to your AIko profile."
            : "Saving your rewards…"}
        </p>
      </div>
    </main>
  );
}

function ResultStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Trophy;
  value: string;
  label: string;
}) {
  return (
    <Card className="text-center">
      <Icon className="mx-auto size-5 text-persimmon-500" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-stone-400">{label}</p>
    </Card>
  );
}

function SkillChange({
  label,
  value,
  change,
}: {
  label: string;
  value: number;
  change: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-semibold text-moss-700">+{change}</span>
      </div>
      <ProgressBar value={value + change} />
    </div>
  );
}
