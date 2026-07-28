"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Crown,
  LoaderCircle,
  RotateCcw,
  WandSparkles,
} from "lucide-react";
import { generateCustomLesson } from "@/lib/custom-lesson-utils";
import type { JLPTLevel, StoryWord } from "@/types/lesson";
import { useAppStore } from "@/store/app-store";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { getBackendMode } from "@/lib/supabase/config";

type GenerationState =
  | "idle"
  | "generating"
  | "story"
  | "activities"
  | "audio"
  | "ready"
  | "error";

type StoryLineResult = {
  japanese?: string;
  english?: string;
  words?: Array<{
    libraryId?: string;
    libraryType?: "kanji" | "vocabulary";
    surface?: string;
    reading?: string;
    meaning?: string;
    scriptType?: "kanji" | "hiragana" | "katakana";
  }>;
};

type GenerationResult = {
  requestId?: string;
  status?: string;
  currentStage?: string;
  progressPercent?: number;
  lessonReady?: boolean;
  lessonId?: string | null;
  lesson_id?: string;
  lessonVersionId?: string | null;
  assignmentId?: string | null;
  error?: string;
  message?: string;
  audioStatus?: string;
  completedGroups?: string[];
  failedGroups?: string[];
  retryable?: boolean;
  permanentFailure?: boolean;
  story?: {
    japaneseTitle?: string;
    lines?: StoryLineResult[];
  } | null;
};

type PreviewStoryLine = {
  japanese: string;
  english: string;
  words: StoryWord[];
};

const generationStages = [
  "Writing your story",
  "Story ready",
  "Creating lesson activities",
  "Checking lesson quality",
  "Saving your lesson",
  "Preparing activity audio",
  "Ready",
];

function stageIndex(
  state: GenerationState,
  currentStage: string,
  lessonReady: boolean,
  audioStatus: string,
): number {
  if (state === "generating") return 0;
  if (state === "ready" && (audioStatus === "ready" || audioStatus === "failed")) {
    return generationStages.length;
  }
  if (lessonReady) return audioStatus === "ready" ? 7 : 5;
  if (currentStage === "quality_check" || currentStage === "activities_validating") return 3;
  if (currentStage === "saving_lesson" || currentStage === "lesson_saving") return 4;
  if (
    currentStage === "audio" ||
    currentStage === "audio_queued" ||
    currentStage === "audio_building"
  ) {
    return 5;
  }
  if (
    currentStage.includes("activit") ||
    currentStage.includes("vocabulary") ||
    currentStage.includes("grammar") ||
    currentStage.includes("listening") ||
    currentStage.includes("review") ||
    currentStage === "retrying_activity_groups"
  ) {
    return 2;
  }
  return state === "story" || state === "activities" ? 1 : 0;
}

function statusLabel(currentStage: string, lessonReady: boolean, audioStatus: string): string {
  if (lessonReady && audioStatus === "building") return "Preparing listening and speaking audio";
  if (lessonReady && audioStatus === "queued") return "Audio queued";
  if (lessonReady) return "Lesson ready";
  if (currentStage === "vocabulary_and_kanji") return "Vocabulary and kanji ready";
  if (currentStage === "grammar_and_reading") return "Grammar and reading ready";
  if (currentStage === "listening_and_speaking") return "Listening and speaking ready";
  if (currentStage === "final_review") return "Final review ready";
  if (currentStage === "quality_check" || currentStage === "activities_validating") {
    return "Checking lesson quality";
  }
  if (currentStage === "saving_lesson" || currentStage === "lesson_saving") {
    return "Saving your lesson";
  }
  if (currentStage === "retrying_activity_groups") return "Retrying an activity group";
  return "Creating lesson activities";
}

function previewLines(source: StoryLineResult[] | undefined): PreviewStoryLine[] {
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
          ) {
            return [];
          }
          return [{
            id: word.libraryId ?? `preview_word_${lineIndex}_${wordIndex}`,
            libraryId: word.libraryId,
            libraryType: word.libraryType,
            position: wordIndex,
            surface: word.surface,
            reading: word.reading,
            meaning: word.meaning,
            scriptType: word.scriptType,
            baseMeaningScore: 0,
            baseRecognitionScore: 0,
            basePronunciationScore: 0,
          }];
        })
      : [];
    return [{ japanese: line.japanese, english: line.english, words }];
  });
}

function setRequestInUrl(requestId: string | null) {
  const url = new URL(window.location.href);
  if (requestId) url.searchParams.set("requestId", requestId);
  else url.searchParams.delete("requestId");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
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
  const [currentStage, setCurrentStage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [storyTitle, setStoryTitle] = useState("");
  const [storyLines, setStoryLines] = useState<PreviewStoryLine[]>([]);
  const [completedGroups, setCompletedGroups] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [audioStatus, setAudioStatus] = useState("pending");

  const applyResult = useCallback((result: GenerationResult) => {
    if (result.story?.lines) {
      const lines = previewLines(result.story.lines);
      if (lines.length > 0) {
        setStoryLines(lines);
        setStoryTitle(result.story.japaneseTitle || "Your new story");
      }
    }
    if (typeof result.currentStage === "string") setCurrentStage(result.currentStage);
    if (typeof result.progressPercent === "number") setProgressPercent(result.progressPercent);
    if (Array.isArray(result.completedGroups)) setCompletedGroups(result.completedGroups);
    if (typeof result.audioStatus === "string") setAudioStatus(result.audioStatus);

    const readyLessonId = result.lessonId ?? result.lesson_id ?? null;
    if (readyLessonId) {
      setLessonId(readyLessonId);
      setState("ready");
      if (result.audioStatus === "failed") {
        setError("Your lesson is ready. Listening and speaking audio can be retried later.");
      } else {
        setError("");
      }
      return;
    }

    if (result.permanentFailure || result.status === "failed") {
      setError(result.message || "AIko could not finish this lesson. You can retry the remaining activities.");
      setState("story");
      return;
    }
    if (result.status === "activities_failed") {
      setError("Your story is safe. One activity group needs another attempt.");
      setState("story");
      return;
    }
    if (result.status === "audio_building" || result.currentStage === "audio") {
      setState("audio");
      return;
    }
    if (result.status && result.status !== "story_ready") {
      setState("activities");
      return;
    }
    setState("story");
  }, []);

  useEffect(() => {
    const activeRequest = new URL(window.location.href).searchParams.get("requestId");
    if (activeRequest) {
      setRequestId(activeRequest);
      setState("story");
      setCurrentStage("restoring");
    }
  }, []);

  useEffect(() => {
    if (!requestId || getBackendMode() === "demo") return;
    let cancelled = false;
    let timer: number | null = null;
    let running = false;

    async function poll() {
      if (cancelled || running) return;
      running = true;
      try {
        const response = await fetch(
          `/api/custom-lessons/status?requestId=${encodeURIComponent(requestId!)}`,
          { cache: "no-store" },
        );
        const result = (await response.json().catch(() => null)) as GenerationResult | null;
        if (cancelled) return;
        if (!response.ok || !result) {
          setError(result?.error || "AIko could not restore this lesson's progress.");
          return;
        }
        applyResult(result);
        const terminal =
          result.permanentFailure ||
          (result.lessonReady &&
            (result.audioStatus === "ready" || result.audioStatus === "failed"));
        if (!terminal) {
          const delay = document.hidden
            ? 10_000
            : result.lessonReady
              ? 5_000
              : 2_500;
          timer = window.setTimeout(() => void poll(), delay);
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(() => void poll(), document.hidden ? 10_000 : 4_000);
        }
      } finally {
        running = false;
      }
    }

    function visibilityChanged() {
      if (document.hidden || cancelled) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void poll();
    }

    void poll();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [applyResult, requestId]);

  async function retryRemaining() {
    if (!requestId) return;
    setError("");
    setState("activities");
    const response = await fetch("/api/custom-lessons/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "activities" }),
    });
    const result = (await response.json().catch(() => null)) as GenerationResult | null;
    if (!response.ok) {
      setError(result?.error || "The remaining activities could not be queued.");
      setState("story");
      return;
    }
    setCurrentStage("activities_queued");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setRequestId(null);
    setRequestInUrl(null);
    setLessonId(null);
    setCurrentStage("writing_story");
    setProgressPercent(0);
    setCompletedGroups([]);
    setAudioStatus("pending");
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
        setLessonId(result.lesson_id);
        setState("ready");
        return;
      }
      if (!result?.requestId || !Array.isArray(result.story?.lines)) {
        setError("The story response was incomplete. Please try again.");
        setState("error");
        return;
      }
      const lines = previewLines(result.story.lines);
      if (!lines.length || lines.some((line) => line.words.length < 1)) {
        setError("The story support library was incomplete. Please try again.");
        setState("error");
        return;
      }
      setRequestId(result.requestId);
      setRequestInUrl(result.requestId);
      applyResult(result);
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

  const lessonReady = Boolean(lessonId);
  const busy =
    state === "generating" ||
    state === "activities" ||
    state === "audio" ||
    (state === "story" && !error);
  const buttonLabel =
    state === "generating"
      ? "Writing your story…"
      : busy
        ? "Building your lesson…"
        : "Create my lesson";
  const progress = stageIndex(state, currentStage, lessonReady, audioStatus);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-8 sm:py-10">
      <header>
        <ButtonLink href="/learn" variant="ghost" className="px-0"><ArrowLeft className="size-4" /> My learning path</ButtonLink>
        <p className="section-kicker mt-6">Pro custom topic</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">What should your next story be about?</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-500">Choose only a topic and level. Your library-backed story appears first; AIko builds the remaining activities in the background.</p>
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
            {error && <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full"><WandSparkles className="size-4" /> {buttonLabel}</Button>
            {requestId && error && !lessonReady && (
              <Button type="button" variant="secondary" className="w-full" onClick={() => void retryRemaining()}>
                <RotateCcw className="size-4" /> Retry remaining activities
              </Button>
            )}
          </form>

          {(busy || lessonReady) && (
            <div className="mt-7 border-t border-stone-100 pt-6" role="status" aria-live="polite">
              <GenerationProgress stages={generationStages} currentIndex={progress} />
              <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
                <span>{statusLabel(currentStage, lessonReady, audioStatus)}</span>
                <span>{Math.max(progressPercent, lessonReady ? 90 : 0)}%</span>
              </div>
              {completedGroups.length > 0 && !lessonReady && (
                <p className="mt-2 text-xs text-moss-700">
                  {completedGroups.length} of 4 activity groups safely stored
                </p>
              )}
            </div>
          )}
        </Card>

        <Card className="min-h-[34rem] p-7 sm:p-9">
          {storyLines.length > 0 ? (
            <div aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Badge tone="moss">Story ready</Badge>
                  <h2 className="mt-3 text-2xl font-semibold">{storyTitle}</h2>
                  <p className="mt-2 max-w-lg text-sm leading-6 text-stone-500">
                    Touch a supported word for reading and meaning. Story audio is intentionally off.
                  </p>
                </div>
                {lessonReady ? (
                  <ButtonLink href={`/lesson/${lessonId}/preview`}>
                    <CheckCircle2 className="size-4" /> Open lesson
                  </ButtonLink>
                ) : !error ? (
                  <span className="flex items-center gap-2 text-xs font-semibold text-moss-700">
                    <LoaderCircle className="size-4 animate-spin" />
                    {statusLabel(currentStage, false, audioStatus)}
                  </span>
                ) : null}
              </div>
              {lessonReady && audioStatus !== "ready" && audioStatus !== "failed" && (
                <p className="mt-5 rounded-2xl bg-moss-50 px-4 py-3 text-sm text-moss-800">
                  Your lesson is ready. Listening and speaking audio is still being prepared.
                </p>
              )}
              <div className="mt-6 space-y-4 rounded-3xl bg-moss-50 p-5 sm:p-7">
                {storyLines.map((line, index) => (
                  <div key={`${line.japanese}-${index}`} className="border-b border-moss-100 pb-4 last:border-0 last:pb-0">
                    <p className="font-serif text-xl leading-9 text-ink">
                      <InspectableText text={line.japanese} terms={line.words} showAudio={false} />
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-500">{line.english}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-center text-xs leading-5 text-stone-400">
                This story and its word library are already stored. Refreshing or leaving this page will not restart generation.
              </p>
            </div>
          ) : state === "ready" ? (
            <div className="grid min-h-[28rem] place-items-center text-center">
              <div>
                <CheckCircle2 className="mx-auto size-12 text-moss-600" />
                <Badge tone="moss" className="mt-6">Saved to your path</Badge>
                <h2 className="mt-4 text-2xl font-semibold">Your lesson is ready.</h2>
                <ButtonLink href={lessonId ? `/lesson/${lessonId}/preview` : "/learn"} className="mt-7">Open my assigned lesson</ButtonLink>
              </div>
            </div>
          ) : state === "generating" ? (
            <div className="grid min-h-[28rem] place-items-center text-center" role="status" aria-live="polite">
              <div><LoaderCircle className="mx-auto size-16 animate-spin text-moss-500" /><Badge tone="moss" className="mt-6">Writing the story first</Badge><h2 className="mt-4 text-2xl font-semibold">AIko is preparing your reading.</h2><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">It appears only after every supported word has a permanent library record.</p></div>
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
