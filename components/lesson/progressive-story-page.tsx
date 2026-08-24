"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Check,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import type { StoryWord } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import {
  createEmptyLessonSession,
  useAppStore,
} from "@/store/app-store";
import { LessonPlayerShell } from "@/components/lesson/lesson-player-shell";
import { InspectableText } from "@/components/exercises/inspectable-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { customLessonRetryAction } from "@/lib/custom-lesson-retry";
import { retirePreviousLessons } from "@/lib/sync/retire-previous-lessons";
import { useBackendLessonStore } from "@/store/backend-lesson-store";

const TOTAL_PHASES = 6;
const ACTIVITY_GROUP_COUNT = 3;
const BUILD_CACHE_PREFIX = "aiko-custom-lesson-build-v1:";

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
  resumeStage?: string | null;
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

type CachedBuildState = {
  result?: GenerationResult;
  storyComplete?: boolean;
};

type ReaderLine = {
  id: string;
  japanese: string;
  english: string;
  words: StoryWord[];
};

function buildCacheKey(requestId: string): string {
  return `${BUILD_CACHE_PREFIX}${requestId}`;
}

function readBuildCache(requestId: string): CachedBuildState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(buildCacheKey(requestId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CachedBuildState)
      : null;
  } catch {
    return null;
  }
}

function writeBuildCache(
  requestId: string,
  patch: Partial<CachedBuildState>,
): void {
  if (typeof window === "undefined") return;
  try {
    const current = readBuildCache(requestId) ?? {};
    const result = patch.result
      ? {
          ...(current.result ?? {}),
          ...patch.result,
          story: patch.result.story ?? current.result?.story ?? null,
          completedGroups:
            patch.result.completedGroups ?? current.result?.completedGroups,
          failedGroups: patch.result.failedGroups ?? current.result?.failedGroups,
        }
      : current.result;
    window.sessionStorage.setItem(
      buildCacheKey(requestId),
      JSON.stringify({ ...current, ...patch, result }),
    );
  } catch {
    // Generation remains server-authoritative if browser storage is unavailable.
  }
}

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

function readinessLabel(
  currentStage: string,
  lessonReady: boolean,
  audioStatus: string,
): string {
  if (lessonReady && audioStatus === "building") return "Preparing listening audio";
  if (lessonReady && audioStatus === "queued") return "Listening audio queued";
  if (lessonReady && audioStatus === "failed") return "Lesson ready · listening audio needs retry";
  if (lessonReady) return "Complete lesson ready";
  const labels: Record<string, string> = {
    queued: "Starting your lesson",
    story_building: "Writing your story",
    vocabulary_enrichment: "Adding word help",
    library_resolution: "Connecting readings and meanings",
    activity_groups: "Building practice from your story",
    final_validation: "Finalizing your lesson",
    lesson_saving: "Adding lesson to your path",
    audio: "Preparing listening audio",
    retryable_failure: "Trying that step again",
    permanent_failure: "Lesson preparation stopped",
    completed: "Complete lesson ready",
  };
  const exact = labels[currentStage];
  if (exact) return exact;
  if (currentStage.startsWith("activity_groups:")) return "Building practice from your story";
  return "Preparing your lesson";
}

function buildNotice(
  currentStage: string,
  lessonReady: boolean,
  audioStatus: string,
  completedGroups: number,
  error: string,
): { title: string; detail: string; complete: boolean; attention: boolean } {
  if (error) {
    return {
      title: "Lesson preparation needs attention",
      detail: error,
      complete: false,
      attention: true,
    };
  }
  if (lessonReady && (audioStatus === "ready" || audioStatus === "failed")) {
    return {
      title: "Your complete lesson is ready",
      detail: "Vocabulary and every remaining activity are ready to open.",
      complete: true,
      attention: false,
    };
  }
  if (lessonReady) {
    return {
      title: "Preparing listening audio",
      detail: "The lesson is playable now while listening audio finishes in the background.",
      complete: false,
      attention: false,
    };
  }

  const completedDetail = `${completedGroups} of ${ACTIVITY_GROUP_COUNT} practice sets ready.`;
  const completedGroupNotices: Record<string, string> = {
    vocabulary_and_kanji: "Vocabulary & kanji ready",
    grammar_and_reading: "Grammar & reading ready",
    listening_and_speaking: "Listening & speaking ready",
  };
  if (completedGroupNotices[currentStage]) {
    return {
      title: completedGroupNotices[currentStage],
      detail: completedDetail,
      complete: true,
      attention: false,
    };
  }
  if (currentStage === "final_validation") {
    return {
      title: "Finalizing your lesson",
      detail: "AIko is making sure all six phases are ready.",
      complete: false,
      attention: false,
    };
  }
  if (currentStage === "lesson_saving") {
    return {
      title: "Adding lesson to your path",
      detail: "Your finished lesson is being added to your learning path.",
      complete: false,
      attention: false,
    };
  }
  return {
    title: readinessLabel(currentStage, lessonReady, audioStatus),
    detail:
      completedGroups > 0
        ? completedDetail
        : "Vocabulary + kanji, grammar, reading, listening, and speaking are being built from your story.",
    complete: false,
    attention: false,
  };
}

function BuildStatusToast({
  currentStage,
  lessonReady,
  audioStatus,
  completedGroups,
  progressPercent,
  error,
  canRetry,
  retrying,
  onRetry,
}: {
  currentStage: string;
  lessonReady: boolean;
  audioStatus: string;
  completedGroups: number;
  progressPercent: number;
  error: string;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  const nextNotice = useMemo(
    () => buildNotice(currentStage, lessonReady, audioStatus, completedGroups, error),
    [audioStatus, completedGroups, currentStage, error, lessonReady],
  );
  const nextKey = `${currentStage}:${lessonReady}:${audioStatus}:${completedGroups}:${error}`;
  const [displayed, setDisplayed] = useState({ key: nextKey, value: nextNotice });
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (displayed.key === nextKey) return;
    const hideTimer = window.setTimeout(() => setVisible(false), 0);
    const replaceTimer = window.setTimeout(() => {
      setDisplayed({ key: nextKey, value: nextNotice });
      setVisible(true);
    }, 240);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(replaceTimer);
    };
  }, [displayed.key, nextKey, nextNotice]);

  useEffect(() => {
    if (!displayed.value.complete || displayed.value.attention) return;
    const hideTimer = window.setTimeout(() => setVisible(false), 1_800);
    const continueTimer = lessonReady
      ? null
      : window.setTimeout(() => {
          setDisplayed({
            key: nextKey,
            value: {
              title: "Building remaining practice",
              detail: `${completedGroups} of ${ACTIVITY_GROUP_COUNT} practice sets ready.`,
              complete: false,
              attention: false,
            },
          });
          setVisible(true);
        }, 2_040);
    return () => {
      window.clearTimeout(hideTimer);
      if (continueTimer !== null) window.clearTimeout(continueTimer);
    };
  }, [completedGroups, displayed, lessonReady, nextKey]);

  const prepared = Math.max(progressPercent, lessonReady ? 90 : 20);
  const retryLabel =
    lessonReady && audioStatus === "failed"
      ? "Retry listening audio"
      : "Retry lesson practice";
  return (
    <aside
      className={`fixed right-4 top-24 z-40 w-[min(22rem,calc(100vw-2rem))] transition-all duration-200 sm:right-6 ${
        visible
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-6 opacity-0"
      }`}
      aria-live="polite"
      aria-atomic="true"
      data-testid="lesson-build-toast"
    >
      <Card className="border-moss-100 bg-white/95 p-4 shadow-float backdrop-blur sm:p-5">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full ${
              displayed.value.attention
                ? "bg-amber-50 text-amber-700"
                : "bg-moss-50 text-moss-700"
            }`}
          >
            {displayed.value.attention ? (
              <AlertTriangle className="size-4" />
            ) : displayed.value.complete ? (
              <Check className="size-4" />
            ) : (
              <LoaderCircle className="size-4 animate-spin" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{displayed.value.title}</p>
            <p className="mt-1 text-xs leading-5 text-stone-500">{displayed.value.detail}</p>
          </div>
        </div>
        {!displayed.value.complete && !displayed.value.attention && (
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-moss-50">
            <span
              className="block h-full rounded-full bg-moss-600 transition-[width] duration-500"
              style={{ width: `${Math.min(100, prepared)}%` }}
            />
          </div>
        )}
        {canRetry && (
          <Button
            type="button"
            variant="secondary"
            className="mt-4 w-full"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RotateCcw className="size-4" />
            )}
            {retrying ? "Queuing…" : retryLabel}
          </Button>
        )}
      </Card>
    </aside>
  );
}

export function ProgressiveStoryPage({ requestId }: { requestId: string }) {
  const router = useRouter();
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const [storyTitle, setStoryTitle] = useState("Your new story");
  const [lines, setLines] = useState<ReaderLine[]>([]);
  const [storyComplete, setStoryComplete] = useState(false);
  const [currentStage, setCurrentStage] = useState("queued");
  const [progressPercent, setProgressPercent] = useState(0);
  const [completedGroups, setCompletedGroups] = useState<string[]>([]);
  const [failedGroups, setFailedGroups] = useState<string[]>([]);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lessonReady, setLessonReady] = useState(false);
  const [audioStatus, setAudioStatus] = useState("pending");
  const [retryableFailure, setRetryableFailure] = useState(false);
  const [permanentFailure, setPermanentFailure] = useState(false);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);

  const applyResult = useCallback(
    (result: GenerationResult) => {
      writeBuildCache(requestId, { result });
      if (result.story?.lines) {
        const nextLines = readerLines(result.story.lines);
        if (nextLines.length > 0) {
          setLines(nextLines);
          setStoryTitle(result.story.japaneseTitle || "Your new story");
        }
      }
      if (
        result.status === "retryable_failure" &&
        typeof result.resumeStage === "string"
      ) {
        setCurrentStage(result.resumeStage);
      } else if (typeof result.currentStage === "string") {
        setCurrentStage(result.currentStage);
      }
      if (typeof result.progressPercent === "number") {
        setProgressPercent(result.progressPercent);
      }
      if (Array.isArray(result.completedGroups)) {
        setCompletedGroups(result.completedGroups);
      }
      if (Array.isArray(result.failedGroups)) {
        setFailedGroups(result.failedGroups);
      }
      if (typeof result.audioStatus === "string") {
        setAudioStatus(result.audioStatus);
      }
      const nextLessonId =
        typeof result.lessonId === "string" ? result.lessonId : null;
      if (nextLessonId) {
        setLessonId(nextLessonId);
        // The story exists, so this lesson has replaced whatever came before
        // it. Retire the previous lesson now: its queued saves can never land
        // and would otherwise keep warning about a lesson already left behind.
        retirePreviousLessons(nextLessonId);
      }
      setLessonReady(result.lessonReady === true || Boolean(nextLessonId));
      const nextPermanentFailure =
        result.permanentFailure === true || result.status === "permanent_failure";
      setPermanentFailure(nextPermanentFailure);
      setRetryableFailure(
        result.retryable === true || result.status === "retryable_failure",
      );
      if (nextPermanentFailure) {
        setError(
          result.message ||
            "AIko could not finish the remaining lesson activities.",
        );
      } else if (result.audioStatus === "failed") {
        setError("The lesson is ready, but listening audio needs another attempt.");
      } else if (result.status === "retryable_failure") {
        setError(
          result.message ||
            "A practice-building step needs another attempt.",
        );
      } else {
        setError("");
      }
    },
    [requestId],
  );

  useEffect(() => {
    let active = true;
    // Deferred off the synchronous effect body to avoid cascading renders.
    void Promise.resolve().then(() => {
      if (!active) return;
      const cached = readBuildCache(requestId);
      if (cached?.result) applyResult(cached.result);
      if (cached?.storyComplete === true) setStoryComplete(true);
    });
    return () => {
      active = false;
    };
  }, [applyResult, requestId]);

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
        const result = (await response.json().catch(() => null)) as
          | GenerationResult
          | null;
        if (cancelled) return;
        if (!response.ok || !result) {
          setError(
            result?.error || "AIko could not restore this lesson's progress.",
          );
          timer = window.setTimeout(() => void poll(), 4_000);
          return;
        }
        applyResult(result);
        const terminal =
          result.permanentFailure ||
          (result.lessonReady &&
            (result.audioStatus === "ready" || result.audioStatus === "failed"));
        if (!terminal) {
          timer = window.setTimeout(
            () => void poll(),
            result.lessonReady ? 5_000 : 2_500,
          );
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(() => void poll(), 4_000);
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

  useEffect(() => {
    if (!lessonId) return;
    router.prefetch(`/lesson/${lessonId}/play`);
  }, [lessonId, router]);

  /**
   * Fetch the lesson while the learner is still reading, not after they ask.
   *
   * prefetch above brings the player's code; it does not bring the lesson. That
   * is fifteen queries behind three sequential lookups, and it only started
   * once the story handed over — so the pause between finishing the story and
   * seeing the first vocabulary question was the whole of it, spent staring at
   * a spinner. Reading takes minutes; this takes one of those seconds.
   *
   * It waits for the build to settle. Warming earlier would put a half-built
   * lesson in the cache the player then reads from.
   */
  const generationSettled =
    lessonReady && (audioStatus === "ready" || audioStatus === "failed");
  useEffect(() => {
    if (!lessonId || !generationSettled) return;
    void useBackendLessonStore
      .getState()
      .loadOne(lessonId)
      .catch(() => undefined);
  }, [generationSettled, lessonId]);

  const supportedWordCount = useMemo(
    () => lines.reduce((total, line) => total + line.words.length, 0),
    [lines],
  );
  const japanesePassage = useMemo(
    () => lines.map((line) => line.japanese.trim()).filter(Boolean).join(""),
    [lines],
  );
  const passageWords = useMemo(
    () => lines.flatMap((line) => line.words),
    [lines],
  );
  // Reaching Vocabulary is the act of finishing Story. There is no separate
  // confirmation to give first, so this waits only on the lesson being built.
  const canContinue = lessonReady && Boolean(lessonId);
  const retryAction = customLessonRetryAction({
    retrying,
    lessonReady,
    audioStatus,
    permanentFailure,
    retryableFailure,
    failedGroupCount: failedGroups.length,
  });
  const canRetryActivities = retryAction === "activities";
  const canRetry = retryAction !== null;

  async function retryRemaining() {
    if (!retryAction) return;
    const action = retryAction;
    setRetrying(true);
    setError("");
    try {
      const response = await fetch("/api/custom-lessons/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const result = (await response.json().catch(() => null)) as
        | GenerationResult
        | null;
      if (!response.ok) {
        setError(
          result?.error || "The remaining lesson work could not be queued.",
        );
        return;
      }
      setRetryableFailure(false);
      setCurrentStage(
        action === "audio" ? "audio_queued" : "activities_queued",
      );
      if (action === "audio") setAudioStatus("queued");
      setPollVersion((value) => value + 1);
    } finally {
      setRetrying(false);
    }
  }

  const continueToLesson = useCallback(() => {
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
    router.replace(`/lesson/${lessonId}/play`);
  }, [lessonId, router, saveLessonSession, storyComplete]);

  useEffect(() => {
    if (!storyComplete || !lessonReady || !lessonId) return;
    continueToLesson();
  }, [continueToLesson, lessonId, lessonReady, storyComplete]);

  function finishStory() {
    writeBuildCache(requestId, { storyComplete: true });
    setStoryComplete(true);
  }

  if (lines.length < 1) {
    const stageTitle = readinessLabel(currentStage, false, audioStatus);
    const stageDetails: Record<string, string> = {
      queued: "Your lesson is in line and will keep preparing even if you leave this page.",
      story_building:
        "AIko is choosing lesson targets and writing your story.",
      vocabulary_enrichment:
        "Your story is ready. AIko is adding words you can tap for reading and meaning.",
      library_resolution:
        "AIko is connecting the words in your story to their readings and meanings.",
    };
    return (
      <main
        className="grid min-h-screen place-items-center bg-paper p-6"
        aria-live="polite"
      >
        <div className="text-center">
          {error ? (
            <AlertTriangle className="mx-auto size-11 text-persimmon-500" />
          ) : (
            <LoaderCircle className="mx-auto size-12 animate-spin text-moss-600" />
          )}
          <h1 className="mt-5 text-2xl font-semibold">
            {error ? "The story could not be prepared." : stageTitle}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-stone-500">
            {error ||
              stageDetails[currentStage] ||
              "AIko is preparing the next part of your lesson."}
          </p>
          {!error && (
            <div className="mx-auto mt-5 h-2 w-64 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-moss-600 transition-[width] duration-500"
                style={{ width: `${Math.max(3, progressPercent)}%` }}
              />
            </div>
          )}
          {canRetryActivities && (
            <Button
              type="button"
              variant="secondary"
              className="mt-6"
              disabled={retrying}
              onClick={() => void retryRemaining()}
            >
              {retrying ? <LoaderCircle className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
              {retrying ? "Queuing…" : "Retry lesson practice"}
            </Button>
          )}
          {error && !canRetryActivities && (
            <Button
              type="button"
              variant="secondary"
              className="mt-6"
              onClick={() => router.push("/learn")}
            >
              Return to Learn
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
      totalPhases={TOTAL_PHASES}
      progress={storyComplete ? 17 : 6}
      canContinue={canContinue}
      continueLabel={lessonReady ? "Vocabulary" : "Preparing vocabulary…"}
      onContinue={finishStory}
      onExit={() => router.push("/learn")}
    >
      <div>
        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge>Story first</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {storyTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500">
                Read naturally. Tap a supported word only when you need its
                reading or meaning. Story audio is off.
              </p>
            </div>
            <div className="rounded-2xl border border-moss-100 bg-moss-50 px-4 py-3 text-xs text-moss-800">
              <p className="font-semibold">
                {supportedWordCount} words with reading or meaning help
              </p>
              <p className="mt-1 text-moss-600">
                Tap supported words whenever you need help
              </p>
            </div>
          </div>

          <Card className="mt-8 p-6 sm:p-10">
            <p
              lang="ja"
              className="font-serif text-xl leading-[3.4rem] text-justify text-ink sm:text-2xl"
              style={{ textJustify: "inter-character" }}
            >
              <InspectableText text={japanesePassage} terms={passageWords} />
            </p>

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
                  {storyComplete
                    ? "Opening vocabulary…"
                    : "Read the story, then continue."}
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {lessonReady
                    ? "Tap any underlined word for its reading and meaning. Vocabulary opens when you continue."
                    : "Tap any underlined word for its reading and meaning. The rest of your lesson is still being built."}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <BuildStatusToast
        currentStage={currentStage}
        lessonReady={lessonReady}
        audioStatus={audioStatus}
        completedGroups={completedGroups.length}
        progressPercent={progressPercent}
        error={
          error ||
          (failedGroups.length > 0
            ? `${failedGroups.length} practice set needs another attempt.`
            : "")
        }
        canRetry={canRetry}
        retrying={retrying}
        onRetry={() => void retryRemaining()}
      />
    </LessonPlayerShell>
  );
}
