"use client";

import { Clock3, Play, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import type { LessonCardState } from "@/types/library";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function LessonCard({
  state,
}: {
  state: LessonCardState;
}) {
  const { lesson, completed, hasResult, active, score, malformed } = state;
  const primaryHref = completed
    ? hasResult ? `/lesson/${lesson.id}/complete` : `/lesson/${lesson.id}/preview`
    : active
      ? `/lesson/${lesson.id}/play`
      : `/lesson/${lesson.id}/play`;
  const primaryLabel = completed ? hasResult ? "View Results" : "Review" : active ? "Resume" : "Start";

  return (
    <Card className="group overflow-hidden p-0 transition hover:border-moss-200 hover:shadow-float">
      <div className={`relative h-36 overflow-hidden p-5 ${lesson.source === "user_generated" ? "bg-persimmon-100" : "bg-moss-900 text-white"}`}>
        <div className="absolute -right-8 -top-10 size-40 rounded-full bg-white/10" />
        <span className="absolute bottom-[-2rem] right-4 font-serif text-8xl opacity-[.06]">{lesson.kanji[0]?.character ?? "学"}</span>
        <div className="relative flex items-start justify-between">
          <div className="flex flex-wrap gap-2">
            <Badge tone={lesson.source === "user_generated" ? "orange" : "moss"} className={lesson.source !== "user_generated" ? "bg-white/10 text-white" : ""}>{lesson.level}</Badge>
            {lesson.source === "user_generated" && <Badge tone="orange"><Sparkles className="mr-1 size-3" /> Custom</Badge>}
          </div>
        </div>
        <p className="relative mt-6 text-xs font-semibold opacity-60">{lesson.topic}</p>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{lesson.title}</h2>
            <p className="mt-1 font-serif text-sm text-muted">{lesson.japaneseTitle}</p>
          </div>
          {completed && score !== undefined && <span className="rounded-full bg-moss-50 px-3 py-1 text-sm font-bold text-moss-700">{score}%</span>}
        </div>
        <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted">{lesson.summary}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {lesson.grammar.slice(0, 2).map((item) => <Badge key={item.id} tone="neutral">{item.pattern}</Badge>)}
          {lesson.kanji.slice(0, 3).map((item) => <Badge key={item.character}>{item.character}</Badge>)}
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
          <div className="text-xs text-muted">
            <p className="flex items-center gap-1.5"><Clock3 className="size-3.5" /> {lesson.durationMinutes} min</p>
            <p className="mt-1 capitalize">{lesson.source.replaceAll("_", " ")}</p>
          </div>
          {malformed ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-persimmon-600"><TriangleAlert className="size-4" /> Unavailable</span>
          ) : (
            <ButtonLink href={primaryHref} className="px-5">{active ? <RotateCcw className="size-4" /> : <Play className="size-4" />}{primaryLabel}</ButtonLink>
          )}
        </div>
      </div>
    </Card>
  );
}
