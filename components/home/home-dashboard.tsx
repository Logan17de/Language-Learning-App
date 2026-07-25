"use client";

import {
  ArrowRight,
  BookOpenCheck,
  Clock3,
  Flame,
  Gem,
  Languages,
  RotateCcw,
  Target,
} from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useAppStore } from "@/store/app-store";

export function HomeDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const sessions = useAppStore((state) => state.lessonSessions);
  const generatedLessons = useAppStore((state) => state.generatedLessons);

  const allLessons = [
    ...generatedLessons,
    ...mockLessons.filter(
      (lesson) => !generatedLessons.some((item) => item.id === lesson.id),
    ),
  ];
  const activeSession = Object.values(sessions).find(
    (session) => !session.completed,
  );
  const activeLesson = activeSession
    ? allLessons.find((lesson) => lesson.id === activeSession.lessonId)
    : undefined;
  const nextLesson =
    allLessons.find(
      (lesson) => !progress.completedLessonIds.includes(lesson.id),
    ) ?? allLessons[0];
  const selectedLesson = activeLesson ?? nextLesson;
  const selectedLessonId = activeSession?.lessonId ?? selectedLesson?.id;
  const lessonPercent = selectedLessonId
    ? progress.lessonProgress[selectedLessonId] ?? 0
    : 0;
  const phaseLabel =
    activeSession && activeLesson
      ? activeLesson.phases[activeSession.currentPhaseIndex]?.label
      : undefined;

  const completedLessons = allLessons.filter((lesson) =>
    progress.completedLessonIds.includes(lesson.id),
  );
  const learnedVocabulary = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.vocabulary.map((item) => item.term),
    ),
  ).size;
  const learnedKanji = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.kanji.map((item) => item.character),
    ),
  ).size;
  const learnedGrammar = new Set(
    completedLessons.flatMap((lesson) =>
      lesson.grammar.map((item) => item.pattern),
    ),
  ).size;

  const levelLessons = allLessons.filter(
    (lesson) => lesson.level === user.level,
  );
  const levelProgress = levelLessons.length
    ? Math.round(
        levelLessons.reduce((total, lesson) => {
          if (progress.completedLessonIds.includes(lesson.id)) return total + 100;
          return total + (progress.lessonProgress[lesson.id] ?? 0);
        }, 0) / levelLessons.length,
      )
    : 0;

  const weakItems = progress.reviewQueue.filter(
    (item) => item.confidence < 70 || item.overdue,
  );
  const weakKanji = weakItems.filter((item) => item.type === "kanji").length;
  const weakGrammar = weakItems.filter((item) => item.type === "grammar").length;
  const weakOther = Math.max(0, weakItems.length - weakKanji - weakGrammar);
  const dailyPercent = user.dailyGoalMinutes
    ? Math.min(
        100,
        Math.round(
          (user.minutesStudiedToday / user.dailyGoalMinutes) * 100,
        ),
      )
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-9">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">Welcome back</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            おはよう, {user.name}.
          </h1>
        </div>
        <div
          className="grid size-11 shrink-0 place-items-center rounded-full bg-moss-600 font-semibold text-white"
          aria-label={user.name + "'s profile"}
        >
          {user.name.charAt(0).toUpperCase()}
        </div>
      </header>

      <section className="mt-7 grid gap-4 sm:grid-cols-3">
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
            <Flame className="size-5" />
          </span>
          <div>
            <p className="text-xl font-semibold">{user.streakDays} days</p>
            <p className="text-xs text-stone-400">current streak</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-moss-100 text-moss-700">
            <Clock3 className="size-5" />
          </span>
          <div>
            <p className="text-xl font-semibold">
              {user.minutesStudiedToday}/{user.dailyGoalMinutes} min
            </p>
            <p className="text-xs text-stone-400">{dailyPercent}% daily goal</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <span className="grid size-10 place-items-center rounded-2xl bg-stone-100 text-stone-600">
            <Gem className="size-5" />
          </span>
          <div>
            <p className="text-xl font-semibold">
              {user.xp.toLocaleString()} XP
            </p>
            <p className="text-xs text-stone-400">learning experience</p>
          </div>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="relative overflow-hidden !bg-moss-900 p-7 text-white sm:p-9">
          <div className="absolute -right-16 -top-20 size-64 rounded-full bg-persimmon-400/20 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <Badge tone="orange">Learn</Badge>
              {selectedLesson && (
                <span className="text-xs font-semibold text-white/50">
                  {selectedLesson.level}
                </span>
              )}
            </div>
            <h2 className="mt-8 text-3xl font-semibold tracking-tight">
              {activeSession ? "Resume your lesson" : "Start your next lesson"}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-6 text-white/65">
              {activeSession
                ? "Continue exactly where you stopped."
                : "Your lesson is ready. Its topic stays hidden until you begin."}
            </p>
            {activeSession && (
              <div className="mt-7 max-w-md">
                <div className="mb-2 flex justify-between text-xs text-white/55">
                  <span>{phaseLabel ?? "Lesson in progress"}</span>
                  <span>{lessonPercent}%</span>
                </div>
                <ProgressBar
                  value={lessonPercent}
                  className="bg-white/10"
                  barClassName="bg-persimmon-400"
                />
              </div>
            )}
            <ButtonLink
              href={
                selectedLessonId
                  ? activeSession
                    ? "/lesson/" + selectedLessonId + "/play"
                    : "/lesson/" + selectedLessonId + "/preview"
                  : "/learn"
              }
              className="mt-8 bg-persimmon-500 px-7 hover:bg-persimmon-600"
            >
              {activeSession ? "Resume lesson" : "Start lesson"}
              <ArrowRight className="size-4" />
            </ButtonLink>
          </div>
        </Card>

        <div className="grid gap-6">
          <Card className="bg-moss-50 p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-moss-700">
                <RotateCcw className="size-5" />
              </span>
              <Badge tone={weakItems.length ? "orange" : "moss"}>
                {weakItems.length} weak
              </Badge>
            </div>
            <h2 className="mt-6 text-xl font-semibold">Review what needs work</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              Only weak language from your lessons appears in Review.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <MiniStat value={weakKanji} label="kanji" />
              <MiniStat value={weakGrammar} label="grammar" />
              <MiniStat value={weakOther} label="other" />
            </div>
            <ButtonLink
              href="/review"
              variant="secondary"
              className="mt-5 w-full bg-white"
            >
              Open review
            </ButtonLink>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
                <Target className="size-5" />
              </span>
              <span className="text-sm font-semibold text-moss-700">
                {user.level} · {levelProgress}%
              </span>
            </div>
            <h2 className="mt-6 text-xl font-semibold">Level progress</h2>
            <ProgressBar value={levelProgress} className="mt-4" />
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <MiniStat value={learnedVocabulary} label="vocabulary" />
              <MiniStat value={learnedKanji} label="kanji" />
              <MiniStat value={learnedGrammar} label="grammar" />
            </div>
            <ButtonLink
              href="/progress"
              variant="secondary"
              className="mt-5 w-full"
            >
              View progress
            </ButtonLink>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl bg-white px-2 py-3 shadow-sm">
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-1 text-[10px] capitalize text-stone-400">{label}</p>
    </div>
  );
}
