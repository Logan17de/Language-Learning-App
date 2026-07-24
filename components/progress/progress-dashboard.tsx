"use client";

import { BookCheck, Brain, Clock3, Flame, Gem, Languages, Target, TrendingUp, Trophy } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { WeeklyActivityChart } from "@/components/progress/weekly-activity-chart";
import { AchievementCard } from "@/components/progress/achievement-card";

export function ProgressDashboard() {
  const user = useAppStore((state) => state.user);
  const progress = useAppStore((state) => state.progress);
  const weeklyMinutes = progress.weeklyActivity.reduce((sum, day) => sum + day.minutes, 0);
  const weeklyGoal = progress.weeklyActivity.reduce((sum, day) => sum + day.goal, 0);
  const lessonScores = progress.recentLessons.slice(0, 5).map((lesson) => lesson.score);
  const metrics = [
    ["Kanji recognition", progress.kanjiRecognition],
    ["Kanji pronunciation", progress.pronunciation],
    ["Vocabulary recognition", 63],
    ["Grammar understanding", progress.grammarUnderstanding],
    ["Grammar production", progress.grammarProduction],
    ["Listening confidence", progress.listeningConfidence],
    ["Speaking confidence", progress.speakingConfidence],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
      <header><p className="section-kicker">Progress analytics</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">See the shape of your learning.</h1><p className="mt-3 max-w-2xl text-stone-500">Clear trends from lessons and reviews—useful direction without pretending every signal is exact.</p></header>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <OverviewStat icon={Target} value={String(user.level)} label="current level" />
        <OverviewStat icon={Gem} value={user.xp.toLocaleString()} label="total XP" />
        <OverviewStat icon={Flame} value={`${user.streakDays} days`} label="current streak" />
        <OverviewStat icon={Trophy} value={`${progress.longestStreak} days`} label="longest streak" />
        <OverviewStat icon={BookCheck} value={String(progress.completedLessonIds.length)} label="lessons completed" />
        <OverviewStat icon={Clock3} value={`${Math.round(progress.totalStudyMinutes / 60)}h`} label="study time" />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <Card className="p-7">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">JLPT curriculum</h2><p className="mt-1 text-sm text-stone-400">Estimated N4 pathway completion</p></div><Ring value={38} label="N4" /></div>
          <div className="mt-7 space-y-5">
            <Metric label="Kanji completed" value={72} detail="65 of 90" />
            <Metric label="Vocabulary completed" value={54} detail="216 of 400" />
            <Metric label="Grammar completed" value={60} detail="36 of 60" />
            <Metric label="Lessons completed" value={35} detail={`${progress.completedLessonIds.length} of 20`} />
          </div>
          <div className="mt-7 grid grid-cols-4 gap-2">
            {["N5", "N4", "N3", "N2"].map((level, index) => <div key={level} className={`rounded-2xl p-3 text-center ${index === 1 ? "bg-moss-600 text-white" : "bg-moss-50"}`}><p className="text-xs font-bold">{level}</p><p className="mt-1 text-[10px] opacity-60">{[82, 38, 8, 0][index]}%</p></div>)}
          </div>
        </Card>
        <Card className="p-7">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Mastery profile</h2><p className="mt-1 text-sm text-stone-400">Estimated from repeated evidence</p></div><Brain className="size-6 text-moss-600" /></div>
          <div className="mt-7 space-y-4">{metrics.map(([label, value]) => <Metric key={label} label={label} value={value} detail={`${value}%`} />)}</div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
        <Card className="p-7"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Weekly activity</h2><p className="mt-1 text-sm text-stone-400">{weeklyMinutes} of {weeklyGoal} minutes</p></div><Badge>{Math.round((weeklyMinutes / weeklyGoal) * 100)}% goal</Badge></div><WeeklyActivityChart activity={progress.weeklyActivity} /></Card>
        <Card className="p-7">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Recent performance</h2><p className="mt-1 text-sm text-stone-400">Lessons and quick reviews</p></div><TrendingUp className="size-5 text-moss-600" /></div>
          <div className="mt-6 space-y-4">
            <TrendRow label="Lesson scores" values={lessonScores.length ? lessonScores : [78, 82, 88]} />
            <TrendRow label="Review scores" values={progress.reviewScores.slice(-5)} />
            <TrendRow label="Study-time trend" values={progress.weeklyActivity.map((day) => Math.min(100, day.minutes * 2))} suffix=" min" />
          </div>
        </Card>
      </div>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="p-7">
          <div className="flex items-center gap-3"><Languages className="size-5 text-persimmon-500" /><div><h2 className="text-xl font-semibold">Focus next</h2><p className="text-sm text-stone-400">Your clearest current weaknesses</p></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {[
              ...progress.weakKanji.slice(0, 2).map((item) => [item.term, `${item.reading} · recognition ${item.mastery}%`]),
              ...progress.weakVocabulary.slice(0, 2).map((item) => [item.term, `${item.meaning} · recognition ${item.mastery}%`]),
              ["〜ので", "Underused in production"],
              ["一緒に", "Repeated pronunciation uncertainty"],
            ].map(([term, detail]) => <div key={`${term}-${detail}`} className="rounded-2xl bg-persimmon-50 p-4"><p className="font-semibold">{term}</p><p className="mt-1 text-xs text-stone-500">{detail}</p></div>)}
          </div>
        </Card>
        <Card className="p-7">
          <div className="flex items-center gap-3"><Trophy className="size-5 text-persimmon-500" /><div><h2 className="text-xl font-semibold">Achievements</h2><p className="text-sm text-stone-400">Milestones worth noticing</p></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{progress.achievements.map((achievement) => <AchievementCard key={achievement.id} achievement={achievement} />)}</div>
        </Card>
      </section>
    </div>
  );
}

function OverviewStat({ icon: Icon, value, label }: { icon: typeof Gem; value: string; label: string }) {
  return <Card className="p-4"><Icon className="size-5 text-moss-600" /><p className="mt-4 text-xl font-semibold">{value}</p><p className="mt-1 text-[11px] text-stone-400">{label}</p></Card>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div><div className="mb-2 flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-stone-400">{detail}</span></div><ProgressBar value={value} className="h-2" /></div>;
}

function Ring({ value, label }: { value: number; label: string }) {
  return <div className="grid size-20 place-items-center rounded-full" style={{ background: `conic-gradient(#4f8068 ${value * 3.6}deg,#e2eee7 0)` }} role="img" aria-label={`${label} curriculum ${value}% complete`}><div className="grid size-14 place-items-center rounded-full bg-white text-center"><span><strong className="block text-sm">{value}%</strong><span className="text-[9px] text-stone-400">{label}</span></span></div></div>;
}

function TrendRow({ label, values, suffix = "%" }: { label: string; values: number[]; suffix?: string }) {
  const current = values.at(-1) ?? 0;
  return <div className="rounded-2xl bg-moss-50 p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-moss-700">{current}{suffix}</span></div><div className="mt-3 flex h-10 items-end gap-1">{values.map((value, index) => <span key={`${value}-${index}`} className="flex-1 rounded-sm bg-moss-500/70" style={{ height: `${Math.max(10, value)}%` }} />)}</div></div>;
}
