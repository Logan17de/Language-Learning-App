"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Crown,
  LoaderCircle,
  WandSparkles,
} from "lucide-react";
import { generateCustomLesson } from "@/lib/custom-lesson-utils";
import type { JLPTLevel } from "@/types/lesson";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import { getBackendMode } from "@/lib/supabase/config";

type GenerationState = "idle" | "generating" | "error";

type GenerationResult = {
  requestId?: string;
  status?: string;
  lesson_id?: string;
  error?: string;
  story?: {
    lines?: Array<{ japanese?: string }>;
  } | null;
};

const openingStages = [
  "Writing your story",
  "Opening the lesson reader",
];

export function CustomTopicPage() {
  const router = useRouter();
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
  const [error, setError] = useState("");

  useEffect(() => {
    const activeRequest = new URL(window.location.href).searchParams.get("requestId");
    if (activeRequest) {
      router.replace(`/lesson/building/${encodeURIComponent(activeRequest)}`);
    }
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("generating");

    if (getBackendMode() === "demo") {
      window.setTimeout(() => {
        const lesson = generateCustomLesson(
          {
            topic,
            level,
            durationMinutes: 30,
            focus: "balanced",
            speakingDifficulty: "medium",
          },
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
        router.replace(`/lesson/${lesson.id}/play`);
      }, 1_200);
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
        router.replace(`/lesson/${result.lesson_id}/play`);
        return;
      }
      if (!result?.requestId || !Array.isArray(result.story?.lines)) {
        setError("The story response was incomplete. Please try again.");
        setState("error");
        return;
      }
      router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`);
    } catch (requestError) {
      const timedOut =
        requestError instanceof DOMException &&
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
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Turn your topic into a complete Japanese lesson.
          </h1>
          <p className="mt-5 max-w-xl leading-7 text-white/65">
            Pro combines your topic and current JLPT level to create a story and the full seven-stage lesson package.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/subscription" className="bg-persimmon-500 hover:bg-persimmon-600">
              See Pro plans
            </ButtonLink>
            <ButtonLink href="/learn" variant="secondary" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
              Return to my lesson
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const busy = state === "generating";
  const topicIdeas = Array.from(
    new Set([
      ...onboarding.interests,
      "A conversation at work",
      "Ordering a regional meal",
      "A weekend trip in Japan",
    ]),
  ).slice(0, 5);

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <ButtonLink href="/learn" variant="ghost" className="px-0">
          <ArrowLeft className="size-4" /> My learning path
        </ButtonLink>
        <p className="section-kicker mt-6">Pro custom topic</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          What should your next story be about?
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">
          Once the story passes its checks, AIko opens it directly in the lesson reader. The remaining lesson readiness stays visible beside your reading.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="Topic">
              <input
                id="custom-topic"
                required
                minLength={2}
                maxLength={120}
                value={topic}
                onChange={(event) => {
                  setTopic(event.target.value);
                  if (state === "error") {
                    setError("");
                    setState("idle");
                  }
                }}
                disabled={busy}
                className="form-input disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="A sustainable farm, my first day at work…"
                aria-describedby="custom-topic-help custom-topic-count"
              />
              <p id="custom-topic-count" className="mt-2 text-right text-xs tabular-nums text-muted">
                {topic.length} / 120
              </p>
            </Field>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-muted">
                Quick ideas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {topicIdeas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    disabled={busy}
                    onClick={() => setTopic(idea)}
                    className="min-h-11 rounded-full border border-border bg-surface px-4 text-left text-xs font-semibold text-muted transition duration-180 hover:border-moss-200 hover:bg-moss-50 hover:text-moss-800 disabled:opacity-50"
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Level">
              <select
                id="custom-level"
                value={level}
                onChange={(event) => setLevel(event.target.value as JLPTLevel)}
                disabled={busy}
                className="form-input disabled:cursor-not-allowed disabled:opacity-60"
                aria-describedby="custom-level-help"
              >
                {(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" disabled={busy} aria-busy={busy} className="w-full">
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <WandSparkles className="size-4" aria-hidden="true" />
              )}
              {busy ? "Writing your story…" : "Create my lesson"}
            </Button>
          </form>
        </Card>

        <Card className="min-h-[25rem] p-7 sm:p-9">
          {busy ? (
            <div role="status" aria-live="polite">
              <Badge tone="moss">Story generation</Badge>
              <h2 className="mt-4 text-2xl font-semibold">AIko is preparing the first phase.</h2>
              <p className="mt-3 text-sm leading-6 text-muted">
                This page is only the launch screen. The approved story will open automatically in the full lesson layout.
              </p>
              <div className="mt-7">
                <GenerationProgress stages={openingStages} currentIndex={0} />
              </div>
            </div>
          ) : (
            <div>
              <Badge tone="moss">How it opens</Badge>
              <h2 className="mt-4 text-2xl font-semibold">Start reading without waiting for the whole lesson.</h2>
              <div className="mt-7 space-y-5">
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <BookOpen className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">Story opens in the real reader</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Library-backed words remain tappable, and story audio stays off.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <LoaderCircle className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">Activities build beside you</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      The right-side readiness panel tracks questions, quality checks, saving, and audio.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">Continue when vocabulary is ready</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      Listening and speaking audio may continue preparing in the background.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const isTopic = label === "Topic";
  const htmlFor = isTopic ? "custom-topic" : "custom-level";
  const description = isTopic
    ? "Describe a situation or goal. Specific prompts produce clearer learning context."
    : "Vocabulary, grammar, and kanji are balanced automatically for this JLPT level.";

  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      <p id={`${htmlFor}-help`} className="mb-2 mt-1 text-xs leading-5 text-muted">
        {description}
      </p>
      {children}
    </div>
  );
}

function learnerLevel(level: string | null): JLPTLevel {
  return level === "N5" ||
    level === "N4" ||
    level === "N3" ||
    level === "N2" ||
    level === "N1"
    ? level
    : "N5";
}
