"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  ChevronDown,
  GraduationCap,
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
import {
  MasteryProgress,
  type MasteryBand,
} from "@/components/lesson/mastery-progress";
import {
  progressRepository,
  type LevelMastery,
} from "@/lib/repositories/progress-repository";
import { getBackendMode } from "@/lib/supabase/config";

export function LessonResult({
  lesson,
  result,
}: {
  lesson: LessonPackage;
  result: LessonCompletionResult;
}) {
  const [levelMastery, setLevelMastery] = useState<LevelMastery | null>(null);
  const [masteryBands, setMasteryBands] = useState<MasteryBand[]>([]);

  // What this lesson moved, by category and then overall. The overall band is
  // last so the sequence ends on the figure that summarises the rest.
  useEffect(() => {
    if (getBackendMode() !== "supabase") return;
    let cancelled = false;
    void progressRepository.lessonMasteryProgress().then((result) => {
      if (cancelled || !result.ok) return;
      setMasteryBands([...result.data.categories, result.data.overall]);
    });
    return () => {
      cancelled = true;
    };
  }, []);


  useEffect(() => {
    if (getBackendMode() !== "supabase") return;
    let cancelled = false;
    void progressRepository.levelMastery().then((result) => {
      if (!cancelled && result.ok) setLevelMastery(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rewardLessonCompletion = useAppStore(
    (state) => state.rewardLessonCompletion,
  );
  const hydrateBackendProgress = useAppStore(
    (state) => state.hydrateBackendProgress,
  );
  const streak = useAppStore((state) => state.user.streakDays);
  const [showMistakes, setShowMistakes] = useState(false);
  const [serverSynced, setServerSynced] = useState(
    getBackendMode() !== "supabase",
  );

  useEffect(() => {
    rewardLessonCompletion(lesson, result);
    if (getBackendMode() !== "supabase") return;

    let cancelled = false;
    const wait = (milliseconds: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

    async function refreshCanonicalRewards() {
      for (const delay of [300, 900, 1800]) {
        await wait(delay);
        if (cancelled) return;
        const snapshot = await progressRepository.loadCurrent();
        if (cancelled || !snapshot.ok) continue;
        hydrateBackendProgress(snapshot.data);
        if (snapshot.data.completedLessonIds.includes(lesson.id)) {
          setServerSynced(true);
          return;
        }
      }
    }

    void refreshCanonicalRewards();
    return () => {
      cancelled = true;
    };
  }, [hydrateBackendProgress, lesson, result, rewardLessonCompletion]);

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
          {/* How the learner stands overall, not how long they sat here. The
              scope is their level and every level below it, which is what
              promotion is judged on. */}
          <ResultStat
            icon={GraduationCap}
            value={levelMastery ? `${levelMastery.averageMastery}%` : "—"}
            label={
              levelMastery?.level
                ? `${levelMastery.level} and below mastered`
                : "Level mastery"
            }
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
          </Card>
          <Card className="p-7">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-5 text-persimmon-500" /> Mastery
            </h2>
            {masteryBands.length ? (
              <MasteryProgress bands={masteryBands} className="mt-6" />
            ) : (
              <p className="mt-6 text-sm leading-6 text-muted">
                Your mastery for this level is being brought up to date.
              </p>
            )}
          </Card>
        </div>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
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
          {serverSynced
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

