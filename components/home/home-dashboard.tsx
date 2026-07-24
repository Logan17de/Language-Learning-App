npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
"use client";

import {
  ArrowRight,
  BookMarked,
  CalendarDays,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  Flame,
  Gem,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import Link from "next/link";
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
  const subscription = useAppStore((state) => state.subscription);
  const activeSession = Object.values(sessions).find(
    (session) => !session.completed,
  );
  const allLessons = [
    ...generatedLessons,
    ...mockLessons.filter(
      (lesson) => !generatedLessons.some((item) => item.id === lesson.id),
    ),
  ];
  const activeLesson = activeSession
    ? allLessons.find((lesson) => lesson.id === activeSession.lessonId)
    : undefined;
  const primaryLesson =
    activeLesson ??
    allLessons.find(
      (lesson) => !progress.completedLessonIds.includes(lesson.id),
    ) ??
    allLessons[0];
  const lessonPercent = progress.lessonProgress[primaryLesson.id] ?? 0;
  const phaseLabel = activeSession
    ? primaryLesson.phases[activeSession.currentPhaseIndex]?.label
    : undefined;
  const dailyPercent = Math.round(
    (user.minutesStudiedToday / user.dailyGoalMinutes) * 100,
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-9">
      <header id="profile" className="flex items-center justify-between">
        <div>
          <p className="text-sm text-stone-500">金曜日 · Friday</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            おはよう, {user.name}.
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold shadow-sm sm:flex">
            <Gem className="size-4 text-persimmon-500" />{" "}
            {user.xp.toLocaleString()} XP
          </span>
          <div
            className="grid size-11 place-items-center rounded-full bg-moss-600 font-semibold text-white"
            aria-label={`${user.name}'s profile`}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_.8fr]">
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-4xl bg-moss-900 p-7 text-white shadow-float sm:p-9">
            <div className="absolute -right-16 -top-24 size-72 rounded-full bg-persimmon-400/20 blur-3xl" />
            <div className="absolute bottom-0 right-10 font-serif text-[12rem] leading-none text-white/[.025]">
              働
            </div>
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="orange">{primaryLesson.level}</Badge>
                <span className="text-xs font-semibold text-white/50">
                  {primaryLesson.durationMinutes} min · {primaryLesson.topic}
                </span>
              </div>
              <p className="mt-7 text-xs font-semibold uppercase tracking-[.18em] text-moss-200">
                {activeSession
                  ? "Resume your active lesson"
                  : progress.recentLessons[0]?.completedAt === "Just now"
                    ? "Next recommended lesson"
                    : "Up next"}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {activeSession
                  ? `Resume “${primaryLesson.title}”`
                  : primaryLesson.title}
              </h2>
              <p className="mt-2 font-serif text-xl text-white/55">
                {primaryLesson.japaneseTitle}
              </p>
              <p className="mt-5 max-w-lg text-sm leading-6 text-white/60">
                {primaryLesson.summary}
              </p>
              {lessonPercent > 0 && (
                <div className="mt-7 max-w-sm">
                  <div className="mb-2 flex justify-between text-xs text-white/55">
                    <span>
                      {phaseLabel
                        ? `${phaseLabel} · Phase ${(activeSession?.currentPhaseIndex ?? 0) + 1} of 7`
                        : "Saved progress"}
                    </span>
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
                  activeSession
                    ? `/lesson/${primaryLesson.id}/play`
                    : lessonPercent === 100
                      ? `/lesson/${primaryLesson.id}/complete`
                      : `/lesson/${primaryLesson.id}/preview`
                }
                className="mt-8 bg-persimmon-500 px-7 shadow-persimmon-500/20 hover:bg-persimmon-600"
              >
                {activeSession
                  ? "Resume lesson"
                  : lessonPercent === 100
                    ? "View lesson results"
                    : "Start next lesson"}
                <ArrowRight className="size-4" />
              </ButtonLink>
            </div>
          </section>

          <section
            id="weekly-progress"
            className="grid gap-6 md:grid-cols-[1.15fr_.85fr]"
          >
            <Card className="p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">This week</p>
                  <p className="mt-1 text-xs text-stone-400">
                    142 of 210 minutes
                  </p>
                </div>
                <Badge>68% goal</Badge>
              </div>
              <div className="mt-7 flex h-40 items-end justify-between gap-2">
                {progress.weeklyActivity.map((item, index) => {
                  const height = Math.max(
                    8,
                    Math.min(100, (item.minutes / 45) * 100),
                  );
                  const today = index === 4;
                  return (
                    <div
                      key={`${item.day}-${index}`}
                      className="flex h-full flex-1 flex-col justify-end gap-2"
                    >
                      <div className="flex flex-1 items-end rounded-xl bg-moss-50">
                        <div
                          className={`w-full rounded-xl transition ${today ? "bg-persimmon-400" : "bg-moss-500"}`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span
                        className={`text-center text-[10px] font-semibold ${today ? "text-persimmon-600" : "text-stone-400"}`}
                      >
                        {item.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="flex flex-col justify-between bg-persimmon-50 p-6 sm:p-7">
              <div className="flex items-start justify-between">
                <span className="grid size-11 place-items-center rounded-2xl bg-white text-persimmon-500 shadow-sm">
                  <Trophy className="size-5" />
                </span>
                <Badge tone="orange">Today</Badge>
              </div>
              <div className="mt-8">
                <p className="text-2xl font-semibold">18 minutes studied</p>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  One short lesson and your daily goal is complete.
                </p>
                <ProgressBar
                  value={dailyPercent}
                  className="mt-5 bg-white"
                  barClassName="bg-persimmon-500"
                />
              </div>
            </Card>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
                    <BookMarked className="size-5" />
                  </span>
                  <div>
                    <h2 className="font-semibold">Weak kanji</h2>
                    <p className="text-xs text-stone-400">
                      Ready for a quick look
                    </p>
                  </div>
                </div>
                <ButtonLink
                  href="/review"
                  variant="ghost"
                  className="min-h-10 px-3"
                >
                  Review
                </ButtonLink>
              </div>
              <div className="mt-5 space-y-3">
                {progress.weakKanji.map((item) => (
                  <div
                    key={item.term}
                    className="flex items-center gap-4 rounded-2xl bg-paper p-3"
                  >
                    <span className="grid size-11 place-items-center rounded-xl bg-white text-lg font-semibold shadow-sm">
                      {item.term}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{item.reading}</p>
                      <p className="text-xs text-stone-400">{item.meaning}</p>
                    </div>
                    <span className="text-xs font-semibold text-persimmon-600">
                      {item.mastery}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-2xl bg-moss-100 text-moss-700">
                  <Lightbulb className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold">Grammar to review</h2>
                  <p className="text-xs text-stone-400">
                    Practice producing these
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {progress.grammarToReview.map((item) => (
                  <div
                    key={item.term}
                    className="rounded-2xl border border-black/[.05] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{item.term}</span>
                      <Badge tone="neutral">{item.mastery}% familiar</Badge>
                    </div>
                    <p className="mt-1 text-xs text-stone-400">
                      {item.meaning}
                    </p>
                    <ProgressBar value={item.mastery} className="mt-3 h-1.5" />
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <div className="grid grid-cols-3 gap-2">
              <Stat
                icon={Flame}
                value={`${user.streakDays}`}
                label="day streak"
                tone="orange"
              />
              <Stat
                icon={Target}
                value={user.level}
                label="current level"
                tone="moss"
              />
              <Stat
                icon={Clock3}
                value={`${user.dailyGoalMinutes}m`}
                label="daily goal"
                tone="neutral"
              />
            </div>
          </Card>

          <Card id="review" className="bg-moss-50">
            <div className="flex items-center justify-between">
              <span className="grid size-11 place-items-center rounded-2xl bg-white text-moss-700">
                <RotateCcw className="size-5" />
              </span>
              <Badge>
                {
                  progress.reviewQueue.filter(
                    (item) => item.dueLabel === "Today",
                  ).length
                }{" "}
                due
              </Badge>
            </div>
            <h2 className="mt-6 text-xl font-semibold">Quick review</h2>
            <p className="mt-2 text-sm leading-6 text-stone-500">
              A focused 5-minute set based on recent difficult items.
            </p>
            <ButtonLink
              href="/review/session"
              variant="secondary"
              className="mt-5 w-full bg-white"
            >
              Start Quick Review
            </ButtonLink>
          </Card>

          {subscription.plan === "premium" ? (
            <Card className="overflow-hidden p-0">
              <div className="bg-persimmon-50 p-6">
                <div className="flex items-center justify-between">
                  <Sparkles className="size-5 text-persimmon-500" />
                  <Badge tone="orange">Pro plan</Badge>
                </div>
                <h2 className="mt-7 text-xl font-semibold">
                  Learn your world.
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Request a custom topic like “AI research” or “job interviews.”
                </p>
              </div>
              <div className="p-4">
                <ButtonLink
                  href="/custom-topic"
                  variant="ghost"
                  className="w-full justify-between rounded-2xl px-3"
                >
                  Custom-topic lesson <ChevronRight className="size-4" />
                </ButtonLink>
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden border-moss-100 p-0">
              <div className="bg-moss-50 p-6">
                <div className="flex items-center justify-between">
                  <Sparkles className="size-5 text-moss-600" />
                  <Badge tone="neutral">Free plan</Badge>
                </div>
                <h2 className="mt-7 text-xl font-semibold">
                  Make lessons more personal.
                </h2>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Pro can use your interests for recommendations and create
                  lessons around your own topics.
                </p>
              </div>
              <div className="p-4">
                <ButtonLink
                  href="/subscription"
                  variant="secondary"
                  className="w-full justify-between rounded-2xl px-4"
                >
                  Explore Pro <ChevronRight className="size-4" />
                </ButtonLink>
              </div>
            </Card>
          )}

          {generatedLessons[0] && (
            <Card className="border-persimmon-100 bg-persimmon-50">
              <Badge tone="orange">Recently generated</Badge>
              <h2 className="mt-4 font-semibold">
                {generatedLessons[0].title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-stone-500">
                {generatedLessons[0].topic} · {generatedLessons[0].level}
              </p>
              <ButtonLink
                href={`/lesson/${generatedLessons[0].id}/preview`}
                variant="secondary"
                className="mt-4 w-full bg-white"
              >
                Preview custom lesson
              </ButtonLink>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Recent achievement</h2>
                <p className="mt-1 text-xs text-stone-400">
                  Keep the progress meaningful
                </p>
              </div>
              <Trophy className="size-5 text-persimmon-500" />
            </div>
            {progress.achievements
              .filter((achievement) => achievement.earned)
              .slice(-1)
              .map((achievement) => (
                <div
                  key={achievement.id}
                  className="mt-5 rounded-2xl bg-moss-50 p-4"
                >
                  <p className="font-semibold">{achievement.title}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {achievement.description}
                  </p>
                </div>
              ))}
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Recent lessons</h2>
                <p className="mt-1 text-xs text-stone-400">
                  Keep the momentum visible
                </p>
              </div>
              <CalendarDays className="size-5 text-stone-300" />
            </div>
            <div className="mt-5 divide-y divide-stone-100">
              {progress.recentLessons.slice(0, 3).map((lesson) => (
                <Link
                  key={lesson.lessonId}
                  href="/home"
                  className="flex items-center gap-3 py-4 first:pt-0 last:pb-0"
                >
                  <CircleCheckBig className="size-5 text-moss-600" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {lesson.title}
                    </p>
                    <p className="text-xs text-stone-400">
                      {lesson.completedAt}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">{lesson.score}%</span>
                  <ChevronRight className="size-4 text-stone-300" />
                </Link>
              ))}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
  tone: "orange" | "moss" | "neutral";
}) {
  const styles = {
    orange: "bg-persimmon-50 text-persimmon-500",
    moss: "bg-moss-100 text-moss-700",
    neutral: "bg-stone-100 text-stone-500",
  };
  return (
    <div className="text-center">
      <span
        className={`mx-auto grid size-9 place-items-center rounded-xl ${styles[tone]}`}
      >
        <Icon className="size-4" />
      </span>
      <p className="mt-2 text-sm font-bold">{value}</p>
      <p className="text-[9px] uppercase tracking-wide text-stone-400">
        {label}
      </p>
    </div>
  );
}
