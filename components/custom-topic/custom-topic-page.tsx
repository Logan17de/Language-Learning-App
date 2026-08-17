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
import type { JLPTLevel } from "@/types/lesson";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";

type GenerationState = "idle" | "generating" | "error";

type GenerationResult = {
  requestId?: string;
  status?: string;
  lesson_id?: string;
  error?: string;
};

const openingStages = ["Writing your story", "Opening your lesson"];

export function CustomTopicPage() {
  const router = useRouter();
  const subscription = useAppStore((state) => state.subscription);
  const onboarding = useAppStore((state) => state.onboarding);
  const user = useAppStore((state) => state.user);
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState<JLPTLevel>(
    learnerLevel(onboarding.level ?? user.level),
  );
  const [state, setState] = useState<GenerationState>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const activeRequest = new URL(window.location.href).searchParams.get(
      "requestId",
    );
    if (activeRequest) {
      router.replace(`/lesson/building/${encodeURIComponent(activeRequest)}`);
    }
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setState("generating");

    try {
      const response = await fetch("/api/custom-lessons/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, level }),
      });
      const result = (await response.json().catch(() => null)) as
        | GenerationResult
        | null;
      if (!response.ok) {
        setError(
          result?.error || "AIko could not create this lesson. Please try again.",
        );
        setState("error");
        return;
      }
      if (result?.status === "published" && result.lesson_id) {
        router.replace(`/lesson/${result.lesson_id}/play`);
        return;
      }
      if (!result?.requestId) {
        setError("The lesson request could not be started. Please try again.");
        setState("error");
        return;
      }
      router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`);
    } catch {
      setError(
        "The connection was interrupted while starting your lesson. Please try again.",
      );
      setState("error");
    }
  }

  if (subscription.plan !== "premium") {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <div className="overflow-hidden rounded-4xl bg-moss-900 p-8 text-white shadow-float sm:p-14">
          <Crown className="size-9 text-persimmon-400" />
          <Badge tone="orange" className="mt-7">
            Pro feature
          </Badge>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Choose the context. AIko builds the lesson.
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-white/65">
            Pick a topic and Japanese level. AIko turns it into the same six-phase learning experience: story, vocabulary + kanji, grammar, reading, listening, and speaking.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/subscription"
              className="bg-persimmon-500 hover:bg-persimmon-600"
            >
              See Pro plans
            </ButtonLink>
            <ButtonLink
              href="/learn"
              variant="secondary"
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
            >
              Return to my learning path
            </ButtonLink>
          </div>
        </div>
      </div>
    );
  }

  const busy = state === "generating";

  return (
    <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <ButtonLink href="/learn" variant="ghost" className="px-0">
          <ArrowLeft className="size-4" /> My learning path
        </ButtonLink>
        <p className="section-kicker mt-6">Custom lesson</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Learn Japanese through something you care about.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">
          Give AIko a topic and level. It writes the story first so you can start reading, then builds the other five practice phases from the same language.
        </p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <Card className="p-6 sm:p-7">
          <form className="space-y-5" onSubmit={submit}>
            <Field label="What do you want to learn through?">
              <input
                required
                minLength={2}
                maxLength={120}
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                disabled={busy}
                className="form-input disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="A sustainable farm, my first day at work…"
              />
            </Field>
            <Field label="Japanese level">
              <select
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value as JLPTLevel)
                }
                disabled={busy}
                className="form-input disabled:cursor-not-allowed disabled:opacity-60"
              >
                {(["N5", "N4", "N3", "N2", "N1"] as JLPTLevel[]).map(
                  (item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ),
                )}
              </select>
            </Field>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
              >
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <WandSparkles className="size-4" />
              )}
              {busy ? "Starting your lesson…" : "Create my lesson"}
            </Button>
          </form>
        </Card>

        <Card className="min-h-[25rem] p-7 sm:p-9">
          {busy ? (
            <div role="status" aria-live="polite">
              <Badge tone="moss">Building your lesson</Badge>
              <h2 className="mt-4 text-2xl font-semibold">
                AIko writes the story first.
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-500">
                As soon as the story is ready, it opens in the lesson reader. Vocabulary, grammar, reading, listening, and speaking continue preparing from that same story.
              </p>
              <div className="mt-7">
                <GenerationProgress stages={openingStages} currentIndex={0} />
              </div>
            </div>
          ) : (
            <div>
              <Badge tone="moss">What AIko builds</Badge>
              <h2 className="mt-4 text-2xl font-semibold">
                Your topic becomes a complete learning loop.
              </h2>
              <div className="mt-7 space-y-5">
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <BookOpen className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">1. A story at your level</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      AIko turns your topic into Japanese you can read in context, with supported words available to inspect.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <LoaderCircle className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">2. Five practice phases from the same story</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      Vocabulary + kanji, grammar, reading, listening, and speaking all reuse the language you just met.
                    </p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-moss-50 text-moss-700">
                    <CheckCircle2 className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">3. Start before every asset is finished</p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">
                      You can begin with the story while later activities and audio continue preparing.
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
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold">{label}</span>
      {children}
    </label>
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
