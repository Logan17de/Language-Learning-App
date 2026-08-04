"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Check,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { StoryWord } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import {
  createEmptyLessonSession,
  useAppStore,
} from "@/store/app-store";
import { LessonPlayerShell } from "@/components/lesson/lesson-player-shell";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { GenerationProgress } from "@/components/custom-topic/generation-progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const generationStages = [
  "Writing your story",
  "Story ready",
  "Creating lesson activities",
  "Checking lesson quality",
  "Saving your lesson",
  "Preparing activity audio",
  "Ready",
];

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
    showReading?: boolean;
  }>;
};

type GenerationResult = {
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
  error?: string;
  message?: string;
  story?: {
    japaneseTitle?: string;
    lines?: StoryLineResult[];
  } | null;
};

type ReaderLine = {
  id: string;
  japanese: string;
  english: string;
  words: StoryWord[];
};

function readerLines(source: StoryLineResult[] | undefined): ReaderLine[] {
  if (!Array.isArray(source)) return [];
  return source.flatMap((line, lineIndex) => {
    if (typeof line.japanese !== "string") return [];
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
            id: word.libraryId ?? `progressive_word_${lineIndex}_${wordIndex}`,
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
    return [{
      id: `progressive_story_line_${lineIndex}`,
      japanese: line.japanese,
      english: typeof line.english === "string" ? line.english : "",
      words,
    }];
  });
}

function progressIndex(
  currentStage: string,
  lessonReady: boolean,
  audioStatus: string,
): number {
  if (lessonReady && (audioStatus === "ready" || audioStatus === "failed")) {
    return generationStages.length;
  }
  if (lessonReady) return 5;
  if (currentStage === "quality_check" || currentStage === "activities_validating") {
    return 3;
  }
  if (currentStage === "saving_lesson" || currentStage === "lesson_saving") {
    return 4;
  }
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
  return 1;
}

function readinessLabel(
  currentStage: string,
  lessonReady: boolean,
  audioStatus: string,
): string {
  if (lessonReady && audioStatus === "building") return "Preparing activity audio";
  if (lessonReady && audioStatus === "queued") return "Activity audio queued";
  if (lessonReady && audioStatus === "failed") return "Lesson ready · audio needs retry";
  if (lessonReady) return "Complete lesson ready";
  if (currentStage === "quality_check" || currentStage === "activities_validating") {
    return "Checking lesson quality";
  }
  if (currentStage === "saving_lesson" || currentStage === "lesson_saving") {
    return "Saving your lesson";
  }
  if (currentStage === "retrying_activity_groups") return "Retrying an activity group";
  return "Creating lesson activities";
}

export function ProgressiveStoryPage({ requestId }: { requestId: string }) {
  const router = useRouter();
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const [storyTitle, setStoryTitle] = useState("Your new story");
  const [lines, setLines] = useState<ReaderLine[]>([]);
  const [storyComplete, setStoryComplete] = useState(false);
  const [currentStage, setCurrentStage] = useState("activities_queued");
  const [generationStatus, setGenerationStatus] = useState("story_ready");
  const [progressPercent, setProgressPercent] = useState(20);
  const [completedGroups, setCompletedGroups] = useState<string[]>([]);
  const [failedGroups, setFailedGroups] = useState<string[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonReady, setLessonReady] = useState(false);
  const [audioStatus, setAudioStatus] = useState("pending");
  const [retryable, setRetryable] = useState(false);
  const [permanentFailure, setPermanentFailure] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);

  const applyResult = useCallback((result: GenerationResult) => {
    if (result.story?.lines) {
      const nextLines = readerLines(result.story.lines);
      if (nextLines.length > 0) {
        setLines(nextLines);
        setStoryTitle(result.story.japaneseTitle || "Your new story");
      }
    }
    if (typeof result.currentStage === "string") setCurrentStage(result.currentStage);
    if (typeof result.status === "string") setGenerationStatus(result.status);
    if (typeof result.progressPercent === "number") {
      setProgressPercent(result.progressPercent);
    }
    if (Array.isArray(result.completedGroups)) setCompletedGroups(result.completedGroups);
    if (Array.isArray(result.failedGroups)) setFailedGroups(result.failedGroups);
    if (typeof result.audioStatus === "string") setAudioStatus(result.audioStatus);
    if (typeof result.retryable === "boolean") setRetryable(result.retryable);
    if (typeof result.permanentFailure === "boolean") {
      setPermanentFailure(result.permanentFailure);
    }
    const nextLessonId = typeof result.lessonId === "string" ? result.lessonId : null;
    if (nextLessonId) setLessonId(nextLessonId);
    setLessonReady(result.lessonReady === true || Boolean(nextLessonId));
    if (result.permanentFailure || result.status === "failed") {
      setError(result.message || "AIko could not finish the remaining lesson activities.");
    } else if (result.status === "activities_failed") {
      setError("Your story is safe. One activity group needs another attempt.");
    } else if (result.audioStatus === "failed") {
      setError("The lesson is ready, but activity audio needs another attempt.");
    } else {
      setError("");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let running = false;

    async function poll() {
      if (cancelled || running) return;
      running = true;
      try {
        const response = await fetch(
          `/api/custom-lessons/status?requestId=${encodeURIComponent(requestId)}`,
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
          result.status === "activities_failed" ||
          (result.lessonReady &&
            (result.audioStatus === "ready" || result.audioStatus === "failed"));
        if (!terminal) {
          timer = window.setTimeout(
            () => void poll(),
            document.hidden ? 10_000 : result.lessonReady ? 5_000 : 2_500,
          );
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(
            () => void poll(),
            document.hidden ? 10_000 : 4_000,
          );
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
  }, [applyResult, pollVersion, requestId]);

  const supportedWordCount = useMemo(
    () => lines.reduce((total, line) => total + line.words.length, 0),
    [lines],
  );
  const japanesePassage = useMemo(
    () => lines.map((line) => line.japanese.trim()).filter(Boolean).join(""),
    [lines],
  );
  const englishPassage = useMemo(
    () => lines.map((line) => line.english.trim()).filter(Boolean).join(" "),
    [lines],
  );
  const passageWords = useMemo(
    () => lines.flatMap((line) => line.words),
    [lines],
  );
  const readiness = progressIndex(currentStage, lessonReady, audioStatus);
  const canContinue = storyComplete && lessonReady && Boolean(lessonId);
  const canRetry =
    !retrying &&
    (generationStatus === "activities_failed" ||
      permanentFailure ||
      (lessonReady && audioStatus === "failed") ||
      retryable);

  async function retryRemaining() {
    if (!canRetry) return;
    setRetrying(true);
    setError("");
    const action = lessonReady && audioStatus === "failed" ? "audio" : "activities";
    try {
      const response = await fetch("/api/custom-lessons/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const result = (await response.json().catch(() => null)) as GenerationResult | null;
      if (!response.ok) {
        setError(result?.error || "The remaining lesson work could not be queued.");
        return;
      }
      setGenerationStatus(action === "audio" ? "audio_queued" : "activities_queued");
      setCurrentStage(action === "audio" ? "audio_queued" : "activities_queued");
      if (action === "audio") setAudioStatus("queued");
      setPermanentFailure(false);
      setPollVersion((value) => value + 1);
    } finally {
      setRetrying(false);
    }
  }

  function continueToLesson() {
    if (!lessonId || !storyComplete) return;
    const session: LessonSession = createEmptyLessonSession(lessonId);
    session.currentPhaseIndex = 1;
    session.storyComplete = true;
    session.completedPhaseIds = ["story"];
    session.activities.story = {
      phaseId: "story",
      activityIndex: 0,
      completed: true,
      attempts: 1,
    };
    saveLessonSession(session);
    router.push(`/lesson/${lessonId}/play`);
  }

  if (lines.length < 1) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper p-6" aria-live="polite">
        <div className="text-center">
          {error ? (
            <AlertTriangle className="mx-auto size-11 text-persimmon-500" />
          ) : (
            <LoaderCircle className="mx-auto size-12 animate-spin text-moss-600" />
          )}
          <h1 className="mt-5 text-2xl font-semibold">
            {error ? "The story could not be restored." : "Opening your story…"}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
            {error || "AIko is moving the approved story into the lesson reader."}
          </p>
          {error && (
            <Button type="button" variant="secondary" className="mt-6" onClick={() => router.push("/custom-topic")}>
              Return to custom topic
            </Button>
          )}
        </div>
      </main>
    );
  }

  return (
    <LessonPlayerShell
      lessonTitle={storyTitle}
      phaseName="Story"
      phaseNumber={1}
      totalPhases={7}
      progress={storyComplete ? 14 : 5}
      canContinue={canContinue}
      continueLabel={lessonReady ? "Vocabulary" : "Preparing vocabulary…"}
      onBack={() => router.push("/learn")}
      onContinue={continueToLesson}
      onExit={() => router.push("/learn")}
    >
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge>Story first</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {storyTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                Read naturally. Touch a supported word only when you need its reading or meaning. Story audio is off.
              </p>
            </div>
            <div className="rounded-2xl border border-moss-100 bg-moss-50 px-4 py-3 text-xs text-moss-800">
              <p className="font-semibold">{supportedWordCount} library-backed taps</p>
              <p className="mt-1 text-moss-600">Unsupported words remain normal text</p>
            </div>
          </div>

          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-persimmon-50 p-4 text-sm text-stone-600">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-persimmon-500" />
            <p>
              The rest of the lesson is being prepared beside you. You do not need to wait on the custom-topic form.
            </p>
          </div>

          <Card className="mt-8 p-6 sm:p-10">
            <p
              lang="ja"
              className="font-serif text-xl leading-[3.4rem] text-justify text-ink sm:text-2xl"
              style={{ textJustify: "inter-character" }}
            >
              <InspectableText text={japanesePassage} terms={passageWords} />
            </p>

            <div className="mt-10 border-t border-stone-200 pt-8">
              <p className="section-kicker">English story</p>
              <p
                lang="en"
                className="mt-4 hyphens-auto text-base leading-7 text-justify text-stone-600 sm:text-lg"
                style={{ textJustify: "inter-word" }}
              >
                {englishPassage}
              </p>
            </div>
          </Card>

          <div className="mt-7 rounded-3xl border border-moss-200 bg-moss-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {storyComplete ? (
                <Check className="size-5 text-moss-700" />
              ) : (
                <BookOpen className="size-5 text-moss-700" />
              )}
              <div className="flex-1">
                <p className="font-semibold">
                  {storyComplete ? "Story explored" : "Finished reading the story?"}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Mark it complete now. Vocabulary opens as soon as the generated lesson is ready.
                </p>
              </div>
              {!storyComplete && (
                <Button type="button" onClick={() => setStoryComplete(true)}>
                  Finish story
                </Button>
              )}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-28">
          <Card className="p-5 sm:p-6" aria-live="polite">
            <p className="section-kicker">Lesson readiness</p>
            <div className="mt-3 flex items-center gap-2">
              {readiness >= generationStages.length ? (
                <Check className="size-5 text-moss-700" />
              ) : (
                <LoaderCircle className="size-5 animate-spin text-moss-600" />
              )}
              <p className="font-semibold">
                {readinessLabel(currentStage, lessonReady, audioStatus)}
              </p>
            </div>
            <div className="mt-5">
              <GenerationProgress stages={generationStages} currentIndex={readiness} />
            </div>
            <div className="mt-5 flex items-center justify-between text-xs text-stone-500">
              <span>{Math.max(progressPercent, lessonReady ? 90 : 20)}% prepared</span>
              <span>{completedGroups.length} / 4 groups</span>
            </div>
            {failedGroups.length > 0 && (
              <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {failedGroups.length} activity group needs another attempt.
              </p>
            )}
            {lessonReady && audioStatus !== "ready" && audioStatus !== "failed" && (
              <p className="mt-4 rounded-2xl bg-moss-50 px-3 py-3 text-xs leading-5 text-moss-800">
                The lesson is playable now. Listening and speaking audio will keep preparing in the background.
              </p>
            )}
            {error && (
              <p className="mt-4 rounded-2xl bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-800">
                {error}
              </p>
            )}
            {canRetry && (
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                disabled={retrying}
                onClick={() => void retryRemaining()}
              >
                {retrying ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RotateCcw className="size-4" />
                )}
                {retrying ? "Queuing…" : "Retry remaining work"}
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </LessonPlayerShell>
  );
}
