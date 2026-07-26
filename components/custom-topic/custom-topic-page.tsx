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
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getBackendMode } from "@/lib/supabase/config";

type GenerationState = "idle" | "generating" | "ready" | "error";

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
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
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
        signal: AbortSignal.timeout(300_000),
      });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result && typeof result === "object" && !Array.isArray(result)
          && "error" in result && typeof result.error === "string"
          ? result.error
          : "AIko could not create this lesson. Please try again.";
        setError(message);
        setState("error");
        return;
      }
      const generatedLessonId =
        result && typeof result === "object" && !Array.isArray(result)
          && "lesson_id" in result && typeof result.lesson_id === "string"
          ? result.lesson_id
          : null;
      if (!generatedLessonId) {
        setError("The lesson was saved, but its link was not returned. Open Learn to continue.");
        setState("error");
        return;
      }
      setLessonId(generatedLessonId);
      setState("ready");
    } catch (requestError) {
      const timedOut = requestError instanceof DOMException
        && (requestError.name === "TimeoutError" || requestError.name === "AbortError");
      setError(timedOut
        ? "Lesson generation is taking longer than expected. Please try again."
        : "The connection was interrupted while creating your lesson. Please try again.");
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
          <p className="mt-5 max-w-xl leading-7 text-white/65">Pro combines your topic, profile interests, and current JLPT level to create a story and the full seven-stage lesson package.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><ButtonLink href="/subscription" className="bg-persimmon-500 hover:bg-persimmon-600">See Pro plans</ButtonLink><ButtonLink href="/learn" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">Return to my lesson</ButtonLink></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <ButtonLink href="/learn" variant="ghost" className="px-0"><ArrowLeft className="size-4" /> My learning path</ButtonLink>
        <p className="section-kicker mt-6">Pro custom topic</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">What should your next story be about?</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">Choose a topic and level. AIko selects the kanji and grammar, builds an encouraging lesson, checks its reusable language library, and saves the completed package to your path.</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Topic"><input required minLength={2} maxLength={120} value={topic} onChange={(event) => setTopic(event.target.value)} disabled={state === "generating"} className="form-input disabled:cursor-not-allowed disabled:opacity-60" placeholder="A sustainable farm, my first day at work…" /></Field>
            <Field label="Level">
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value as JLPTLevel)}
                disabled={state === "generating"}
                className="form-input disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <Button type="submit" disabled={state === "generating"} className="w-full"><WandSparkles className="size-4" /> {state === "generating" ? "Creating and checking…" : "Create my lesson"}</Button>
          </form>
        </Card>

        <Card className="grid min-h-[34rem] place-items-center p-8 text-center">
          {state === "ready" ? (
            <div>
              <CheckCircle2 className="mx-auto size-12 text-moss-600" />
              <Badge tone="moss" className="mt-6">Saved to your path</Badge>
              <h2 className="mt-4 text-2xl font-semibold">Your complete lesson is ready.</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">The story, vocabulary, grammar, reading, listening, speaking, and review package has been saved and assigned without changing your level.</p>
              <ButtonLink href={lessonId ? `/lesson/${lessonId}/preview` : "/learn"} className="mt-7">Open my assigned lesson</ButtonLink>
            </div>
          ) : state === "generating" ? (
            <div role="status" aria-live="polite" className="w-full max-w-lg">
              <div className="relative mx-auto grid size-24 place-items-center">
                <span className="absolute inset-0 rounded-full border border-moss-100 bg-gradient-to-br from-moss-50 to-persimmon-50 shadow-sm" />
                <LoaderCircle className="absolute size-24 animate-spin text-moss-500 [animation-duration:1.8s]" strokeWidth={1.2} />
                <span className="relative grid size-14 place-items-center rounded-full bg-white text-persimmon-500 shadow-sm">
                  <Sparkles className="size-6 animate-pulse" />
                </span>
              </div>

              <Badge tone="moss" className="mt-6">AI lesson studio is working</Badge>
              <h2 className="mt-4 text-2xl font-semibold">Our AI is creating a lesson for you.</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
                AIko is turning your topic into a connected Japanese lesson. Keep this page open while it writes, checks, and saves your package.
              </p>

              <div className="mx-auto mt-7 space-y-2.5 text-left">
                <GenerationStep delay="0ms">Selecting 5 kanji and 3 grammar targets</GenerationStep>
                <GenerationStep delay="300ms">Writing your story and practice activities</GenerationStep>
                <GenerationStep delay="600ms">Checking answers and saving your lesson</GenerationStep>
              </div>

              <div className="mt-7 overflow-hidden rounded-full bg-stone-100 p-1">
                <div className="h-1.5 w-full animate-pulse rounded-full bg-gradient-to-r from-moss-500 via-persimmon-400 to-moss-500" />
              </div>
              <p className="mt-3 text-xs font-medium text-stone-400">
                A complete lesson usually takes one or two minutes.
              </p>
            </div>
          ) : (
            <div>
              <WandSparkles className="mx-auto size-11 text-moss-300" />
              <h2 className="mt-5 text-xl font-semibold">Your topic, inside a structured path</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">You choose only the topic and level. AIko handles the encouraging tone, target language, reusable library records, and seven connected stages.</p>
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

function GenerationStep({ children, delay }: { children: React.ReactNode; delay: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-white/75 px-4 py-3 shadow-sm">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 animate-pulse rounded-full bg-moss-500"
        style={{ animationDelay: delay }}
      />
      <span className="text-sm font-medium text-stone-600">{children}</span>
    </div>
  );
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" || level === "N4" || level === "N3" || level === "N2" || level === "N1" ? level : "N5";
}
