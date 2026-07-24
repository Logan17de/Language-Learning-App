"use client";

import { useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Crown, Sparkles, WandSparkles } from "lucide-react";
import { generateCustomLesson } from "@/lib/custom-lesson-utils";
import type { LessonFocus } from "@/types/app-preferences";
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
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [focus, setFocus] = useState<LessonFocus>("balanced");
  const [speaking, setSpeaking] = useState<"easy" | "medium" | "hard">("medium");
  const [note, setNote] = useState("");
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState("");
  const level = learnerLevel(onboarding.level ?? user.level);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("generating");

    if (getBackendMode() === "demo") {
      window.setTimeout(() => {
        const lesson = generateCustomLesson(
          { topic, level, durationMinutes: duration, focus, speakingDifficulty: speaking },
          generated.length + 1,
        );
        addGenerated(lesson);
        addRequest({
          id: `custom_request_${generated.length + 1}`,
          topic,
          level,
          durationMinutes: duration,
          focus,
          speakingDifficulty: speaking,
          note,
          outcome: "new",
          generatedLessonId: lesson.id,
          createdAt: "Just now",
        });
        setState("ready");
      }, 1200);
      return;
    }

    const response = await fetch("/api/custom-lessons/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, durationMinutes: duration, focus, speakingDifficulty: speaking, note }),
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
    setState("ready");
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
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">AIko creates a new lesson at your profile level, weaves in your interests where natural, validates the package, and saves it to your learning path.</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Topic"><input required minLength={2} maxLength={120} value={topic} onChange={(event) => setTopic(event.target.value)} className="form-input" placeholder="A sustainable farm, my first day at work…" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your profile level"><div className="form-input flex items-center bg-stone-50 font-semibold text-moss-700">{level} · managed from your profile</div></Field>
              <Field label="Lesson length"><select value={duration} onChange={(event) => setDuration(Number(event.target.value) as 15 | 30 | 45 | 60)} className="form-input">{[15, 30, 45, 60].map((item) => <option key={item} value={item}>{item} minutes</option>)}</select></Field>
              <Field label="Preferred focus"><select value={focus} onChange={(event) => setFocus(event.target.value as LessonFocus)} className="form-input">{["balanced", "conversation", "vocabulary", "grammar", "reading", "speaking", "workplace Japanese"].map((item) => <option key={item} className="capitalize">{item}</option>)}</select></Field>
              <Field label="Speaking difficulty"><select value={speaking} onChange={(event) => setSpeaking(event.target.value as "easy" | "medium" | "hard")} className="form-input">{["easy", "medium", "hard"].map((item) => <option key={item} className="capitalize">{item}</option>)}</select></Field>
            </div>
            <Field label="Optional note"><textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} className="form-input min-h-28 resize-none py-3" placeholder="A situation, vocabulary preference, or learning need…" /></Field>
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
              <ButtonLink href="/learn" className="mt-7">Open my assigned lesson</ButtonLink>
            </div>
          ) : state === "generating" ? (
            <div>
              <span className="mx-auto grid size-16 animate-pulse place-items-center rounded-3xl bg-persimmon-100 text-persimmon-600"><Sparkles className="size-7" /></span>
              <h2 className="mt-6 text-2xl font-semibold">Building the full lesson package…</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">AIko is writing the story, creating activities, checking answer consistency, and storing the result. This can take about a minute.</p>
            </div>
          ) : (
            <div>
              <WandSparkles className="mx-auto size-11 text-moss-300" />
              <h2 className="mt-5 text-xl font-semibold">Your topic, inside a structured path</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-500">You choose the topic. AIko keeps the level fixed, incorporates your interests, and creates the same seven connected stages as every curated lesson.</p>
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
