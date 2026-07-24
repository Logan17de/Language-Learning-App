"use client";

import { useMemo, useState } from "react";
import { BookOpenCheck, Brain, CalendarClock, Flame, Headphones, Languages, Mic2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import type { ReviewDashboardItem } from "@/types/review-session";
import { useAppStore } from "@/store/app-store";
import { AppShell } from "@/components/layout/app-shell";
import { ReviewItemCard } from "@/components/review/review-item-card";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ReviewFilter = "due" | "weak" | "mistakes" | "mastered" | "all";
const filters: Array<{ id: ReviewFilter; label: string }> = [
  { id: "due", label: "Due now" },
  { id: "weak", label: "Weak" },
  { id: "mistakes", label: "Recent mistakes" },
  { id: "mastered", label: "Mastered" },
  { id: "all", label: "All" },
];

export function ReviewDashboard() {
  const [filter, setFilter] = useState<ReviewFilter>("due");
  const queue = useAppStore((state) => state.progress.reviewQueue);
  const history = useAppStore((state) => state.reviewHistory);
  const user = useAppStore((state) => state.user);
  const items = useMemo<ReviewDashboardItem[]>(() => queue.map((item) => ({
    ...item,
    status: item.overdue ? "overdue" : item.confidence < 55 ? "weak" : item.confidence >= 80 ? "mastered" : item.dueLabel === "Today" ? "due" : "improving",
  })), [queue]);
  const filtered = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "due") return item.status === "due" || item.status === "overdue";
    if (filter === "weak") return item.status === "weak";
    if (filter === "mastered") return item.status === "mastered";
    return item.reason?.toLowerCase().includes("mistake") || item.reason?.toLowerCase().includes("missed");
  });
  const typeCounts = (["kanji", "vocabulary", "grammar", "listening", "speaking"] as const).map((type) => ({
    type,
    count: queue.filter((item) => item.type === type).length,
  }));

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="section-kicker">Review dashboard</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Strengthen what almost stuck.</h1><p className="mt-3 max-w-2xl text-stone-500">Review uses only language you have already seen and prioritizes repeated evidence.</p></div>
          <ButtonLink href="/review/session" className="px-7"><RotateCcw className="size-4" /> {queue.length ? "Start Quick Review" : "Practice a sample set"}</ButtonLink>
        </header>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Summary icon={CalendarClock} value={`${queue.filter((item) => item.dueLabel === "Today").length}`} label="items due today" tone="moss" />
          <Summary icon={Flame} value={`${user.streakDays}`} label="day review streak" tone="orange" />
          <Summary icon={Brain} value={`${Math.max(5, queue.length * 1.2).toFixed(0)} min`} label="estimated time" tone="neutral" />
          <Summary icon={Sparkles} value={history[0] ? `${history[0].score}%` : "—"} label="last review score" tone="moss" />
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-5">
          {typeCounts.map(({ type, count }) => {
            const icons = { kanji: Languages, vocabulary: BookOpenCheck, grammar: Brain, listening: Headphones, speaking: Mic2 };
            const Icon = icons[type];
            return <Card key={type} className="p-4"><Icon className="size-5 text-moss-600" /><p className="mt-4 text-2xl font-semibold">{count}</p><p className="mt-1 text-xs capitalize text-stone-400">{type}</p></Card>;
          })}
        </section>

        <Card className="mt-6 grid gap-5 !bg-moss-900 p-6 text-white md:grid-cols-[auto_1fr_auto] md:items-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-white/10 text-persimmon-400"><ShieldCheck className="size-6" /></span>
          <div>
            <h2 className="text-lg font-semibold">Insights, not a lesson wishlist</h2>
            <p className="mt-1 text-sm leading-6 text-white/65">Review shows where your recall is strong and where it needs support. There is no lesson starring: AIko uses this evidence automatically when it schedules practice and selects what comes next.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Insight value={items.filter((item) => item.status === "mastered").length} label="strong" />
            <Insight value={items.filter((item) => item.status === "weak" || item.status === "overdue").length} label="needs work" />
          </div>
        </Card>

        <div className="mt-8 flex flex-wrap gap-2" role="tablist" aria-label="Review item filters">
          {filters.map((item) => <button key={item.id} type="button" role="tab" aria-selected={filter === item.id} onClick={() => setFilter(item.id)} className={cn("min-h-10 rounded-full px-4 text-xs font-semibold focus:outline-none focus:ring-4 focus:ring-moss-100", filter === item.id ? "bg-moss-600 text-white" : "bg-white text-stone-500")}>{item.label}</button>)}
        </div>

        {filtered.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <ReviewItemCard key={item.id} item={item} />)}</div>
        ) : (
          <div className="mt-5 rounded-4xl bg-white py-14 text-center"><BookOpenCheck className="mx-auto size-9 text-moss-300" /><h2 className="mt-4 text-xl font-semibold">Nothing in this view</h2><p className="mt-2 text-sm text-stone-500">That is good news. Try another filter or practice the sample set.</p></div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <ButtonLink href="/review/session" variant="secondary">Review Weak Kanji</ButtonLink>
          <ButtonLink href="/review/session" variant="secondary">Review Grammar</ButtonLink>
          <ButtonLink href="/review/session" variant="secondary">Review Mistakes</ButtonLink>
        </section>
        <p className="mt-5 text-center text-xs text-stone-400">Next scheduled review: tomorrow at 7:30 PM</p>
      </div>
    </AppShell>
  );
}

function Summary({ icon: Icon, value, label, tone }: { icon: typeof Brain; value: string; label: string; tone: "moss" | "orange" | "neutral" }) {
  const styles = { moss: "bg-moss-100 text-moss-700", orange: "bg-persimmon-100 text-persimmon-600", neutral: "bg-stone-100 text-stone-600" };
  return <Card className="flex items-center gap-4"><span className={`grid size-11 place-items-center rounded-2xl ${styles[tone]}`}><Icon className="size-5" /></span><div><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-stone-400">{label}</p></div></Card>;
}

function Insight({ value, label }: { value: number; label: string }) {
  return <div className="min-w-20 rounded-2xl bg-white/[.08] px-3 py-2"><p className="text-xl font-semibold">{value}</p><p className="text-[.65rem] uppercase tracking-wide text-white/45">{label}</p></div>;
}
