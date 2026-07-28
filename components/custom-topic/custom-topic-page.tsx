"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  LoaderCircle,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { generateCustomLesson } from "@/lib/custom-lesson-utils";
import type { JLPTLevel } from "@/types/lesson";
import type { CustomLessonGenerationStage } from "@/types/app-preferences";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import { getBackendMode } from "@/lib/supabase/config";

type GenerationState =
  | "idle"
  | "generating"
  | "story"
  | "activities"
  | "audio"
  | "ready"
  | "error";

type GenerationResult = {
  requestId?: string;
  status?: string;
  lesson_id?: string;
  error?: string;
  audio?: { status?: string };
  story?: {
    japaneseTitle?: string;
    lines?: Array<{ japanese?: string; english?: string }>;
  };
};

const generationStages: CustomLessonGenerationStage[] = [
  "Writing your story",
  "Building lesson activities",
  "Preparing lesson audio",
  "Ready",
];

function progressIndex(state: GenerationState): number {
  if (state === "generating") return 0;
  if (state === "story" || state === "activities") return 1;
  if (state === "audio") return 2;
  if (state === "ready") return generationStages.length;
  return 0;
}

export function CustomTopicPage() {
  const subscription = useAppStore((state) => state.subscription);
  const onboarding = useAppStore((state) => state.onboarding);
  const user = useAppStore((state) => state.user);
  const generated = useAppStore((state) => state.generatedLessons);
  const addGenerated = useAppStore((state) => state.addGeneratedLesson);
  const addRequest = useAppStore((state) => state.addCustomLessonRequest);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<JLPTLevel>(
    learnerLevel(onboarding.level ?? user.level),
  );
  const [state, setState] = useState<GenerationState>("idle");
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyLines, setStoryLines] = useState<Array<{ japanese: string; english: string }>>([]);
  const [error, setError] = useState("");
  const [audioWarning, setAudioWarning] = useState("");

  async function prepareAudio(id: string, completedLessonId: string) {
    setState("audio");
    try {
      const response = await fetch("/api/custom-lessons/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action: "audio" }),
        signal: AbortSignal.timeout(300_000),
      });
      const result = (await response.json().catch(() => null)) as GenerationResult | null;
      const audioReady = response.ok && result?.audio?.status === "ready";
      if (!audioReady) {
        setAudioWarning(
          "Your lesson is ready, but some audio could not be prepared yet. It can still be generated when needed.",
        );
      }
    } catch {
      setAudioWarning(
        "Your lesson is ready, but audio preparation was interrupted. It can still be generated when needed.",
      );
    }
    setLessonId(completedLessonId);
    setState("ready");
  }

  async function completeLesson(id: string) {
    setState("activities");
    try {
      const response = await fetch("/api/custom-lessons/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, action: "activities" }),
        signal: AbortSignal.timeout(300_000),
      });
      const result = (await response.json().catch(() => null)) as GenerationResult | null;
      if (!response.ok || !result?.lesson_id) {
        setError(result?.error || "The story is safe, but the remaining activities could not be completed. Try again.");
        setState("story");
        return;
      }
      setLessonId(result.lesson_id);
      await prepareAudio(id, result.lesson_id);
    } catch (requestError) {
      const timedOut = requestError instanceof DOMException &&
        (requestError.name === "TimeoutError" || requestError.name === "AbortError");
      setError(
        timedOut
          ? "The story is safe. The remaining activities need more time—tap retry."
          : "The story is safe, but the connection stopped while building the remaining activities.",
      );
      setState("story");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAudioWarning("");
    setRequestId(null);
    setLessonId(null);
    setStoryTitle("");
    setStoryLines([]);
    setState("generating");

    if (getBackendMode() === "demo") {
      window.setTimeout(() => {
        const lesson = generateCustomLesson(
          { topic, level, durationMinutes: 30, focus: "balanced", speakingDifficulty: "medium" },
          generated.length + 1,
        );
        addGenerated(lesson);
        addRequest({
          id: `custom_request_${generated.length + 1}`,
          topic,
          level,
          durationMinutes: 30,
          focus: "balanced",
          speakingDifficulty: "medium",
          note: "",
          outcome: "new",
          generatedLessonId: lesson.id,
          createdAt: "Just now",
        });
        setLessonId(lesson.id);
        setState("ready");
      }, 1200);
      return;
    }

    try {
      const response = await fetch("/api/custom-lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level }),
        signal: AbortSignal.timeout(180_000),
      });
      const result = (await response.json().catch(() => null)) as GenerationResult | null;
      if (!response.ok) {
        setError(result?.error || "AIko could not create this story. Please try again.");
        setState("error");
        return;
      }
      if (result?.status === "published" && result.lesson_id) {
        setLessonId(result.lesson_id);
        setState("ready");
        return;
      }
      if (!result?.requestId || !Array.isArray(result.story?.lines)) {
        setError("The story response was incomplete. Please try again.");
        setState("error");
        return;
      }
      const lines = result.story.lines.flatMap((line) =>
        typeof line.japanese === "string" && typeof line.english === "string"
          ? [{ japanese: line.japanese, english: line.english }]
          : [],
      );
      if (!lines.length) {
        setError("The story response was incomplete. Please try again.");
        setState("error");
        return;
      }
      setRequestId(result.requestId);
      setStoryTitle(result.story.japaneseTitle || "Your new story");
      setStoryLines(lines);
      setState("story");
      await completeLesson(result.requestId);
    } catch (requestError) {
      const timedOut = requestError instanceof DOMException &&
        (requestError.name === "TimeoutError" || requestError.name === "AbortError");
      setError(
        timedOut
          ? "Story generation is taking longer than expected. Please try again."
          : "The connection was interrupted while creating your story. Please try again.",
      );
      setState("error");
    }
  }

  if (subscription.plan !== "premium") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <div className="overflow-hidden rounded-4xl bg-moss-900 p-8 text-white shadow-float sm:p-14">
          <Crown className="size-9 text-persimmon-400" />
          <Badge tone="orange" className="mt-7">Pro feature</Badge>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Turn your topic into a complete Japanese lesson.</h1>
          <p className="mt-5 max-w-xl leading-7 text-white/65">Pro combines your topic and current JLPT level to create a story and the full seven-stage lesson package.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><ButtonLink href="/subscription" className="bg-persimmon-500 hover:bg-persimmon-600">See Pro plans</ButtonLink><ButtonLink href="/learn" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">Return to my lesson</ButtonLink></div>
        </div>
      </div>
    );
  }

  const busy = state === "generating" || state === "story" || state === "activities" || state === "audio";
  const buttonLabel =
    state === "generating"
      ? "Writing your story…"
      : state === "story" || state === "activities"
        ? "Building lesson activities…"
        : state === "audio"
          ? "Preparing lesson audio…"
          : "Create my lesson";

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <ButtonLink href="/learn" variant="ghost" className="px-0"><ArrowLeft className="size-4" /> My learning path</ButtonLink>
        <p className="section-kicker mt-6">Pro custom topic</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">What should your next story be about?</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">Choose only a topic and level. AIko returns the story first, builds the lesson activities, and then prepares reusable audio.</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[.8fr_1.2fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Topic"><input required minLength={2} maxLength={120} value={topic} onChange={(event) => setTopic(event.target.value)} disabled={busy} className="form-input disabled:cursor-not-allowed disabled:opacity-60" placeholder="A sustainable farm, my first day at work…" /></Field>
            <Field label="Level">
              <select value={level} onChange={(event) => setLevel(event.target.value as JLPTLevel)} disabled={busy} className="form-input disabled:cursor-not-allowed disabled:opacity-60">
                {(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            {audioWarning && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{audioWarning}</p>}
            <Button type="submit" disabled={busy} className="w-full"><WandSparkles className="size-4" /> {buttonLabel}</Button>
            {state === "story" && error && requestId && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => { setError(""); void completeLesson(requestId); }}>
                <Sparkles className="size-4" /> Retry remaining lesson
              </Button>
            )}
          </form>

          {busy && (
            <div className="mt-7 border-t border-stone-100 pt-6" role="status" aria-live="polite">
              <GenerationProgress stages={generationStages} currentIndex={progressIndex(state)} />
            </div>
          )}
        </Card>

        <Card className="min-h-[34rem] p-7 sm:p-9">
          {state === "ready" ? (
            <div className="grid min-h-[28rem] place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-12 text-moss-600" />
                <Badge tone="moss" className="mt-6">Saved to your path</Badge>
                <h2 className="mt-4 text-2xl font-semibold">Your complete lesson is ready.</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">The activities are saved. Reusable audio was prepared when available.</p>
                <ButtonLink href={lessonId ? `/lesson/${lessonId}/preview` : "/learn"} className="mt-7">Open my assigned lesson</ButtonLink>
              </div>
            </div>
          ) : state === "story" || state === "activities" || state === "audio" ? (
            <div aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><Badge tone="moss">Story ready</Badge><h2 className="mt-3 text-2xl font-semibold">{storyTitle}</h2></div>
                {!error && (
                  <span className="flex items-center gap-2 text-xs font-semibold text-moss-700">
                    <LoaderCircle className="size-4 animate-spin" />
                    {state === "audio" ? "Preparing audio" : "Building lesson activities"}
                  </span>
                )}
              </div>
              <div className="mt-6 space-y-4 rounded-3xl bg-moss-50 p-5 sm:p-7">
                {storyLines.map((line, index) => (
                  <div key={`${line.japanese}-${index}`} className="border-b border-moss-100 pb-4 last:border-0 last:pb-0">
                    <p className="font-serif text-xl leading-9 text-ink">{line.japanese}</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">{line.english}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-xs leading-5 text-stone-400">You can read now. The progress list shows the actual backend phase currently running.</p>
            </div>
          ) : state === "generating" ? (
            <div className="grid min-h-[28rem] place-items-center text-center" role="status" aria-live="polite">
              <div><LoaderCircle className="mx-auto size-16 animate-spin text-moss-500" /><Badge tone="moss" className="mt-6">Writing the story first</Badge><h2 className="mt-4 text-2xl font-semibold">AIko is preparing your reading.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">The validated story appears as soon as it is ready.</p></div>
            </div>
          ) : state === "error" ? (
            <div className="grid min-h-[28rem] place-items-center text-center">
              <div><WandSparkles className="mx-auto size-11 text-red-300" /><h2 className="mt-5 text-xl font-semibold">The lesson could not be started.</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">Your topic is still in the form. Review the error and try again.</p></div>
            </div>
          ) : (
            <div className="grid min-h-[28rem] place-items-center text-center">
              <div><WandSparkles className="mx-auto size-11 text-moss-300" /><h2 className="mt-5 text-xl font-semibold">Your topic, inside a structured path</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">You choose the topic and level. AIko creates the connected lesson.</p></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label}</span>{children}</label>;
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" || level === "N4" || level === "N3" || level === "N2" || level === "N1" ? level : "N5";
}
