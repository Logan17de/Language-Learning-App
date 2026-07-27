"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Layers3,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import type { LessonPackage } from "@/types/lesson";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLessonLoadLabel } from "@/lib/lesson-utils";
import { useAppStore } from "@/store/app-store";
import { LessonReportDialog } from "@/components/support/lesson-report-dialog";

export function LessonPreview({ lesson }: { lesson: LessonPackage }) {
  const savedProgress = useAppStore((state) => state.progress.lessonProgress[lesson.id] ?? 0);
  const session = useAppStore((state) => state.lessonSessions[lesson.id]);
  const isComplete = Boolean(session?.completed && session.completionResult);
  const lessonHref = isComplete ? `/lesson/${lesson.id}/complete` : `/lesson/${lesson.id}/play`;
  const actionLabel = isComplete ? "View lesson results" : savedProgress > 0 ? "Resume lesson" : "Start lesson";

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-black/[.05] bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/home" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-stone-500 hover:bg-moss-50 hover:text-moss-700">
            <ArrowLeft className="size-4" /> Home
          </Link>
          <span className="text-sm font-semibold">Lesson preview</span>
          <Link href="/home" aria-label="Close lesson preview" className="grid size-11 place-items-center rounded-full text-stone-400 hover:bg-stone-100"><X className="size-5" /></Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <div className="mb-4 flex justify-end"><LessonReportDialog lessonId={lesson.id} lessonTitle={lesson.title} phase="Preview" compact /></div>
        <section className="relative overflow-hidden rounded-4xl bg-moss-900 p-7 text-white shadow-float sm:p-12">
          <div className="absolute -right-16 -top-20 size-80 rounded-full bg-persimmon-400/20 blur-3xl" />
          <div className="absolute bottom-[-3rem] right-10 font-serif text-[15rem] leading-none text-white/[.035]">駅</div>
          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="orange">{lesson.level}</Badge>
                <Badge className="bg-white/10 text-white">{lesson.topic}</Badge>
                <Badge className="bg-white/10 text-white">{getLessonLoadLabel(lesson)} load</Badge>
              </div>
              <p className="mt-8 font-serif text-2xl text-moss-200">{lesson.japaneseTitle}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-6xl">{lesson.title}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/60">{lesson.summary}</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
              <div className="flex items-center gap-3">
                <Clock3 className="size-5 text-persimmon-400" />
                <div><p className="text-sm font-semibold">{lesson.durationMinutes} minutes</p><p className="text-xs text-white/45">7 connected phases</p></div>
              </div>
              <div className="mt-5 h-px bg-white/10" />
              <div className="mt-5 flex items-center gap-3">
                <Sparkles className="size-5 text-persimmon-400" />
                <div><p className="text-sm font-semibold">{lesson.grammar.length} grammar · {lesson.kanji.filter((item) => !item.isReview).length} new kanji</p><p className="text-xs text-white/45">Plus {lesson.reviewItems.length} review items</p></div>
              </div>
            </div>
          </div>
        </section>

        {savedProgress > 0 && savedProgress < 100 && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm text-persimmon-600">
            <RotateCcw className="size-4" />
            <span className="font-semibold">You have {savedProgress}% saved progress in this lesson.</span>
          </div>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_.72fr]">
          <div className="space-y-6">
            <Card className="p-7">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-moss-100 text-moss-700"><Layers3 className="size-5" /></span>
                <div><h2 className="text-xl font-semibold">What you’ll learn</h2><p className="text-sm text-stone-400">New material and timely review</p></div>
              </div>
              <div className="mt-7 grid gap-6 sm:grid-cols-3">
                <PreviewList title="New grammar" items={lesson.grammar.map((item) => ({ primary: item.pattern, secondary: item.meaning }))} />
                <PreviewList title="New kanji" items={lesson.kanji.filter((item) => !item.isReview).map((item) => ({ primary: item.character, secondary: `${item.reading} · ${item.meaning}` }))} />
                <PreviewList title="Review" items={lesson.reviewItems.map((item) => ({ primary: item, secondary: item === "駅" ? "station" : "because / since" }))} review />
              </div>
            </Card>

          </div>

          <aside>
            <Card className="sticky top-6 p-7">
              <p className="text-xs font-bold uppercase tracking-[.18em] text-moss-600">Lesson flow</p>
              <ol className="mt-6 space-y-1">
                {lesson.phases.map((phase, index) => (
                  <li key={phase.id} className="flex gap-4 rounded-2xl p-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-moss-50 text-xs font-bold text-moss-700">{index + 1}</span>
                    <div><p className="text-sm font-semibold">{phase.label}</p><p className="mt-0.5 text-xs leading-5 text-stone-400">{phase.description}</p></div>
                  </li>
                ))}
              </ol>
              <ButtonLink href={lessonHref} className="mt-7 w-full">
                {actionLabel} <ArrowRight className="size-4" />
              </ButtonLink>
              <Link href="/home" className="mt-3 flex min-h-12 items-center justify-center rounded-full text-sm font-semibold text-stone-500 hover:bg-stone-50">
                Choose another lesson
              </Link>
              <p className="mt-4 text-center text-[11px] leading-5 text-stone-400">Your progress will be saved locally on this device.</p>
            </Card>
          </aside>
        </div>
      </main>

    </div>
  );
}

function PreviewList({ title, items, review = false }: { title: string; items: Array<{ primary: string; secondary: string }>; review?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[.15em] text-stone-400">{title}</p>
      <ul className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.primary} className="flex items-start gap-3">
            <span className={`mt-1 grid size-5 shrink-0 place-items-center rounded-full ${review ? "bg-persimmon-100 text-persimmon-600" : "bg-moss-100 text-moss-700"}`}>
              <Check className="size-3" />
            </span>
            <div><p className="font-semibold">{item.primary}</p><p className="mt-0.5 text-xs text-stone-400">{item.secondary}</p></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
