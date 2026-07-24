"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, SearchX, Sparkles } from "lucide-react";
import { mockLessons } from "@/data/mock-lessons";
import { learnerVisibleLessons, mergeCanonicalLessons } from "@/lib/canonical-lessons";
import { buildLessonCardStates, filterLessonCards } from "@/lib/lesson-search-utils";
import type { LessonLibraryFilter, LessonLibraryTab } from "@/types/library";
import { useAppStore } from "@/store/app-store";
import { useAdminStore } from "@/store/admin-store";
import { cn } from "@/lib/utils";
import { LessonCard } from "@/components/learn/lesson-card";
import { LessonFilters } from "@/components/learn/lesson-filters";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button";

const tabs: Array<{ id: LessonLibraryTab; label: string }> = [
  { id: "recommended", label: "Recommended" },
  { id: "jlpt", label: "JLPT" },
  { id: "topics", label: "Topics" },
  { id: "completed", label: "Completed" },
  { id: "saved", label: "Saved" },
  { id: "custom", label: "Custom" },
];

const defaultFilter: LessonLibraryFilter = {
  tab: "recommended",
  query: "",
  level: "all",
  topic: "all",
  duration: "all",
  completion: "all",
};

export function LessonLibrary() {
  const [filter, setFilter] = useState(defaultFilter);
  const [loading, setLoading] = useState(true);
  const generated = useAppStore((state) => state.generatedLessons);
  const overrides = useAdminStore((state) => state.lessonOverrides);
  const deletedLessonIds = useAdminStore((state) => state.deletedLessonIds);
  const savedIds = useAppStore((state) => state.savedLessonIds);
  const completedIds = useAppStore((state) => state.progress.completedLessonIds);
  const recentLessons = useAppStore((state) => state.progress.recentLessons);
  const sessions = useAppStore((state) => state.lessonSessions);
  const toggleSaved = useAppStore((state) => state.toggleSavedLesson);
  const lessons = useMemo(
    () => learnerVisibleLessons(mergeCanonicalLessons(mockLessons, generated, overrides, deletedLessonIds)),
    [deletedLessonIds, generated, overrides],
  );
  const topics = useMemo(() => Array.from(new Set(lessons.map((lesson) => lesson.topic))).sort(), [lessons]);
  const cards = useMemo(
    () => filterLessonCards(buildLessonCardStates(lessons, savedIds, completedIds, sessions, recentLessons), filter),
    [completedIds, filter, lessons, recentLessons, savedIds, sessions],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="section-kicker">Lesson library</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Learn with a clear path.</h1><p className="mt-3 max-w-2xl text-stone-500">Choose a structured lesson, return to an active one, or save something for later.</p></div>
        <ButtonLink href="/custom-topic" variant="secondary"><Sparkles className="size-4 text-persimmon-500" /> Request a custom topic</ButtonLink>
      </header>

      <div className="mt-8 overflow-x-auto pb-2">
        <div className="flex min-w-max gap-2" role="tablist" aria-label="Lesson library sections">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" role="tab" aria-selected={filter.tab === tab.id} onClick={() => setFilter({ ...filter, tab: tab.id })} className={cn("min-h-11 rounded-full px-5 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-moss-100", filter.tab === tab.id ? "bg-moss-600 text-white" : "bg-white text-stone-500 hover:text-moss-700")}>{tab.label}</button>
          ))}
        </div>
      </div>
      <div className="mt-4"><LessonFilters value={filter} topics={topics} onChange={setFilter} /></div>

      {loading ? (
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading lessons">
          {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="h-[28rem] animate-pulse rounded-3xl bg-moss-50" />)}
        </div>
      ) : cards.length ? (
        <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => <LessonCard key={card.lesson.id} state={card} onToggleSaved={toggleSaved} />)}
        </div>
      ) : (
        <div className="mt-7 rounded-4xl border border-dashed border-moss-200 bg-white py-16 text-center">
          {filter.tab === "custom" ? <BookOpen className="mx-auto size-9 text-moss-300" /> : <SearchX className="mx-auto size-9 text-moss-300" />}
          <h2 className="mt-5 text-xl font-semibold">{filter.tab === "custom" ? "No custom lessons yet" : "No lessons match these filters"}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">{filter.tab === "custom" ? "Request a premium custom topic and it will appear here after validation." : "Try clearing a filter or searching for a broader topic."}</p>
          {filter.tab === "custom" ? <ButtonLink href="/custom-topic" className="mt-6">Create a custom lesson</ButtonLink> : <Button type="button" variant="secondary" onClick={() => setFilter(defaultFilter)} className="mt-6">Clear filters</Button>}
        </div>
      )}
    </div>
  );
}
