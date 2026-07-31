"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type { StoryWord } from "@/types/lesson";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface StoryLineResult {
  japanese?: string;
  english?: string;
  words?: Array<{
    libraryId?: string;
    libraryType?: "kanji" | "vocabulary";
    surface?: string;
    reading?: string;
    meaning?: string;
    scriptType?: "kanji" | "hiragana" | "katakana";
    showReading?: boolean;
  }>;
}

interface StatusResult {
  requestId?: string;
  status?: string;
  currentStage?: string;
  progressPercent?: number;
  lessonReady?: boolean;
  lessonId?: string | null;
  audioStatus?: string;
  completedGroups?: string[];
  failedGroups?: string[];
  retryable?: boolean;
  permanentFailure?: boolean;
  message?: string;
  error?: string;
  story?: {
    japaneseTitle?: string;
    lines?: StoryLineResult[];
  } | null;
}

interface StoryLine {
  id: string;
  japanese: string;
  english: string;
  words: StoryWord[];
}

const stages = [
  "Story ready",
  "Creating lesson activities",
  "Checking lesson quality",
  "Saving your lesson",
  "Preparing activity audio",
  "Ready",
];

function toStoryLines(source: StoryLineResult[] | undefined): StoryLine[] {
  if (!Array.isArray(source)) return [];
  return source.flatMap((line, lineIndex) => {
    if (typeof line.japanese !== "string" || typeof line.english !== "string") return [];
    const words = Array.isArray(line.words)
      ? line.words.flatMap((word, wordIndex): StoryWord[] => {
          if (
            typeof word.surface !== "string" ||
            typeof word.reading !== "string" ||
            typeof word.meaning !== "string" ||
            (word.scriptType !== "kanji" &&
              word.scriptType !== "hiragana" &&
              word.scriptType !== "katakana")
          ) return [];
          return [{
            id: word.libraryId ?? `progressive_${lineIndex}_${wordIndex}`,
            libraryId: word.libraryId,
            libraryType: word.libraryType,
            position: wordIndex,
            surface: word.surface,
            reading: word.reading,
            meaning: word.meaning,
            scriptType: word.scriptType,
            showReading: word.showReading,
            baseMeaningScore: 0,
            baseRecognitionScore: 0,
            basePronunciationScore: 0,
          }];
        })
      : [];
    return [{ id: `story_line_${lineIndex}`, japanese: line.japanese, english: line.english, words }];
  });
}

function activeStage(result: StatusResult | null): number {
  if (!result) return 1;
  if (result.lessonReady && (result.audioStatus === "ready" || result.audioStatus === "failed")) return 6;
  if (result.lessonReady) return 4;
  const stage = result.currentStage ?? "";
  if (stage.includes("quality") || stage.includes("validat")) return 2;
  if (stage.includes("saving")) return 3;
  if (stage.includes("audio")) return 4;
  return 1;
}

function readinessLabel(result: StatusResult | null): string {
  if (!result) return "Loading lesson progress";
  if (result.lessonReady && result.audioStatus === "building") return "Lesson ready · preparing audio";
  if (result.lessonReady) return "Your lesson is ready";
  if (result.currentStage === "retrying_activity_groups") return "Retrying an activity group";
  return "Building the remaining lesson";
}

export function ProgressiveStoryPage({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/custom-lessons/status?requestId=${encodeURIComponent(requestId)}`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => null)) as StatusResult | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.error || "AIko could not load this story.");
    }
    setResult(payload);
    setError("");
    return payload;
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    async function poll() {
      try {
        const payload = await load();
        if (cancelled) return;
        const terminal = payload.permanentFailure ||
          (payload.lessonReady && (payload.audioStatus === "ready" || payload.audioStatus === "failed"));
        if (!terminal) timer = window.setTimeout(poll, document.hidden ? 10_000 : 2_500);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "AIko could not load this story.");
          timer = window.setTimeout(poll, 5_000);
        }
      }
    }
    void poll();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [load]);

  const storyLines = useMemo(() => toStoryLines(result?.story?.lines), [result?.story?.lines]);
  const stage = activeStage(result);
  const progress = Math.max(20, Math.min(100, result?.progressPercent ?? 20));

  async function retryActivities() {
    setRetrying(true);
    setError("");
    try {
      const response = await fetch("/api/custom-lessons/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action: "activities" }),
      });
      const payload = (await response.json().catch(() => null)) as StatusResult | null;
      if (!response.ok) throw new Error(payload?.error || "The remaining activities could not be queued.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The remaining activities could not be queued.");
    } finally {
      setRetrying(false);
    }
  }

  if (!result?.story || storyLines.length === 0) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-8 animate-spin text-moss-700" />
          <p className="mt-4 font-semibold">Opening your story…</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-7xl px-5 py-7 sm:px-8 lg:py-10">
        <button
          type="button"
          onClick={() => router.push("/learn")}
          className="inline-flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-ink"
        >
          <ArrowLeft className="size-4" /> My learning path
        </button>

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <section>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Badge>Story first</Badge>
                <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                  {result.story.japaneseTitle || "Your new story"}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                  Read the real lesson now. Touch a supported word for its reading and meaning while AIko prepares the remaining activities.
                </p>
              </div>
              <div className="rounded-2xl border border-moss-100 bg-moss-50 px-4 py-3 text-xs text-moss-800">
                <p className="font-semibold">{storyLines.reduce((count, line) => count + line.words.length, 0)} library-backed words</p>
                <p className="mt-1 text-moss-600">Story audio is off</p>
              </div>
            </div>

            <Card className="mt-7 p-6 sm:p-10">
              <div className="space-y-8">
                {storyLines.map((line) => (
                  <div key={line.id} className="border-b border-stone-100 pb-7 last:border-0 last:pb-0">
                    <InspectableText
                      text={line.japanese}
                      terms={line.words}
                      className="font-serif text-xl leading-[3.2rem] text-ink sm:text-2xl"
                    />
                    <p className="mt-2 text-sm leading-6 text-stone-500">{line.english}</p>
                  </div>
                ))}
              </div>
            </Card>
          </section>

          <aside className="lg:sticky lg:top-6">
            <Card className="p-6">
              <div className="flex items-center gap-3">
                {stage >= 6 ? (
                  <CheckCircle2 className="size-6 text-moss-700" />
                ) : (
                  <LoaderCircle className="size-6 animate-spin text-persimmon-500" />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-moss-700">Lesson readiness</p>
                  <p className="mt-1 font-semibold">{readinessLabel(result)}</p>
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-moss-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-stone-500">
                <span>{result.completedGroups?.length ?? 0} of 4 activity groups stored</span>
                <span>{progress}%</span>
              </div>

              <div className="mt-6 space-y-4">
                {stages.map((label, index) => {
                  const completed = index < stage;
                  const active = index === stage && stage < stages.length;
                  return (
                    <div key={label} className="flex items-center gap-3 text-sm">
                      {completed ? (
                        <span className="grid size-6 place-items-center rounded-full bg-moss-700 text-white"><Check className="size-3.5" /></span>
                      ) : active ? (
                        <span className="grid size-6 place-items-center rounded-full bg-persimmon-100 text-persimmon-600"><LoaderCircle className="size-3.5 animate-spin" /></span>
                      ) : (
                        <span className="grid size-6 place-items-center rounded-full bg-stone-100 text-stone-300"><Circle className="size-3.5" /></span>
                      )}
                      <span className={completed || active ? "font-medium text-ink" : "text-stone-400"}>{label}</span>
                    </div>
                  );
                })}
              </div>

              {error && <p className="mt-5 rounded-2xl bg-red-50 p-3 text-xs leading-5 text-red-700">{error}</p>}

              {result.lessonId ? (
                <ButtonLink href={`/lesson/${result.lessonId}/play`} className="mt-6 w-full justify-center">
                  Continue full lesson
                </ButtonLink>
              ) : result.retryable ? (
                <Button type="button" onClick={retryActivities} disabled={retrying} className="mt-6 w-full justify-center">
                  <RotateCcw className={`size-4 ${retrying ? "animate-spin" : ""}`} /> Retry remaining activities
                </Button>
              ) : (
                <p className="mt-6 text-xs leading-5 text-stone-500">
                  You can keep reading. This page updates automatically and your story is already saved.
                </p>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
