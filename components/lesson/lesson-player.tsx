"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Crown,
  Headphones,
  LoaderCircle,
  Mic2,
} from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import { calculateLessonXp } from "@/lib/xp";
import { phaseIsComplete } from "@/lib/lesson-phase-progress";
import { restartIncompleteLessonPhase } from "@/lib/lesson-resume";
import {
  createEmptyLessonSession,
  normalizeLessonSession,
  useAppStore,
} from "@/store/app-store";
import { Button, ButtonLink } from "@/components/ui/button";
import { LessonPlayerShell } from "@/components/lesson/lesson-player-shell";
import { StoryPhase } from "@/components/lesson/story-phase";
import { VocabularyPhase } from "@/components/lesson/vocabulary-phase";
import {
  GrammarPhase,
} from "@/components/lesson/grammar-phase";
import { ReadingPhase } from "@/components/lesson/reading-phase";
import { ListeningPhase } from "@/components/lesson/listening-phase";
import { SpeakingPhase } from "@/components/lesson/speaking-phase";
import { LessonReportDialog } from "@/components/support/lesson-report-dialog";
import { preloadListeningAudio } from "@/components/exercises/audio-control";
import { preloadSpeakingReadingHint } from "@/lib/audio/speaking-reading-preload";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import {
  confirmLessonStanding,
  flushPendingLessonPhaseCommits,
  queueLessonPhaseCompletion,
  restoreLessonProgress,
  syncLessonCompletion,
  syncLessonProgress,
  syncLessonSectionSkip,
} from "@/lib/sync/backend-sync";
import { pendingLessonPhaseError } from "@/lib/sync/offline-queue";
import {
  activeLessonChangedEvent,
  activeLessonFromStorage,
  activeLessonStorageKey,
  isLessonSupersededError,
  lessonSupersededEvent,
  lessonWasSuperseded,
  markLessonSuperseded,
} from "@/lib/sync/lesson-standing";

type ProtectedPractice = "listening" | "speaking";

function preferDurableSession(
  local: LessonSession,
  candidate: LessonSession,
): LessonSession {
  if (local.completed !== candidate.completed) {
    return candidate.completed ? candidate : local;
  }
  if (local.completedPhaseIds.length !== candidate.completedPhaseIds.length) {
    return candidate.completedPhaseIds.length > local.completedPhaseIds.length
      ? candidate
      : local;
  }
  return Date.parse(candidate.updatedAt) > Date.parse(local.updatedAt)
    ? candidate
    : local;
}

function completionForAccess(
  lesson: LessonPackage,
  session: LessonSession,
  premiumPhasesAccessible: boolean,
) {
  const result = calculateLessonCompletion(lesson, session);
  if (premiumPhasesAccessible) return result;

  // This remains only an offline/display fallback. The server is reward
  // authority. Free learners skip protected Listening/Speaking practice.
  const score = Math.min(100, Math.round(result.score / 0.8));
  return {
    ...result,
    score,
    xpGained: calculateLessonXp(score),
    pronunciationChange: 0,
  };
}

function isPremiumPhase(
  phaseId: LessonPhaseId,
): phaseId is "listening" | "speaking" {
  return phaseId === "listening" || phaseId === "speaking";
}

export function LessonPlayer({
  lesson,
  routeLessonId = lesson.id,
}: {
  lesson: LessonPackage;
  routeLessonId?: string;
}) {
  const router = useRouter();
  const accountId = useBackendLessonStore((state) => state.ownerUserId);
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const resetLessonSession = useAppStore((state) => state.resetLessonSession);
  const [takenOver, setTakenOver] = useState(false);
  const [session, setSession] = useState<LessonSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [backgroundSaveError, setBackgroundSaveError] = useState<string | null>(null);
  const [isRetryingBackgroundSave, setIsRetryingBackgroundSave] = useState(false);
  const restoredLessonRef = useRef<string | null>(null);
  const editedDuringRestoreRef = useRef(false);
  const advancingRef = useRef(false);
  const storyCommitRef = useRef(false);
  const premiumPhasesAccessible = lesson.premiumPhaseAccess !== "locked";
  const showTakenOver = useCallback(() => {
    markLessonSuperseded(lesson.id);
    setCommitError(null);
    setBackgroundSaveError(null);
    setTakenOver(true);
  }, [lesson.id]);

  // Warm the first Listening clip while the learner is finishing the phase
  // before it, so the first play feels instant. Only the first clip is primed
  // here; ListeningPhase then keeps exactly one clip ahead as the learner
  // moves. Fetching all five up front would put five downloads in flight at
  // once, competing with the lesson content the learner is actually reading.
  const listeningPhaseIndex = lesson.phases.findIndex(
    (phase) => phase.id === "listening",
  );
  const currentPhaseIndex = session?.currentPhaseIndex ?? 0;
  const readingActivityIndex = session?.activityIndex ?? 0;
  const readingTotal = lesson.readingQuestions?.length ?? 0;
  const nearListening =
    listeningPhaseIndex >= 0 &&
    (currentPhaseIndex >= listeningPhaseIndex ||
      (currentPhaseIndex === listeningPhaseIndex - 1 &&
        (readingTotal === 0 || readingActivityIndex >= readingTotal - 1)));

  useEffect(() => {
    if (!premiumPhasesAccessible || !nearListening) return;
    const first = lesson.listeningExercises[0];
    if (!first) return;
    void preloadListeningAudio({
      text: first.transcript,
      audioAssetId: first.audioAssetId,
      browserTts: lesson.runtimeAudio === "browser_tts",
    }).catch(() => undefined);
  }, [lesson, premiumPhasesAccessible, nearListening]);

  // Speaking question one is the only reading hint warmed during Listening.
  // Once Speaking opens, SpeakingPhase keeps exactly one question ahead.
  const speakingPhaseIndex = lesson.phases.findIndex(
    (phase) => phase.id === "speaking",
  );
  const inListeningBeforeSpeaking =
    speakingPhaseIndex > 0 && currentPhaseIndex === speakingPhaseIndex - 1;

  useEffect(() => {
    if (!premiumPhasesAccessible || !inListeningBeforeSpeaking) return;
    const first = lesson.speakingExercises[0];
    if (!first) return;
    void preloadSpeakingReadingHint({
      accountId,
      exerciseId: first.id,
    }).catch(() => undefined);
  }, [accountId, inListeningBeforeSpeaking, lesson, premiumPhasesAccessible]);

  /**
   * The learner opened another lesson somewhere else, so this one is over here.
   *
   * A browser left on a set-aside lesson cannot tell from the outside: it holds
   * a full local copy and looks perfectly healthy, while every section it
   * finishes is refused. Saying so is the whole point — and the local copy goes
   * with it, because the lesson has left this learner's path and there is
   * nothing here to come back to. What was already finished keeps its mastery;
   * that was earned section by section and never depended on this browser.
   */
  useEffect(() => {
    let active = true;
    if (lessonWasSuperseded(lesson.id)) {
      queueMicrotask(() => {
        if (active) showTakenOver();
      });
    }
    const handle = (event: Event) => {
      if ((event as CustomEvent<string>).detail === lesson.id) showTakenOver();
    };
    const handleActiveLesson = (event: Event) => {
      const activeLessonId = (event as CustomEvent<string>).detail;
      if (activeLessonId && activeLessonId !== lesson.id) showTakenOver();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== activeLessonStorageKey) return;
      const activeLessonId = activeLessonFromStorage(event.newValue);
      if (activeLessonId && activeLessonId !== lesson.id) showTakenOver();
    };
    window.addEventListener(lessonSupersededEvent, handle);
    window.addEventListener(activeLessonChangedEvent, handleActiveLesson);
    window.addEventListener("storage", handleStorage);
    return () => {
      active = false;
      window.removeEventListener(lessonSupersededEvent, handle);
      window.removeEventListener(activeLessonChangedEvent, handleActiveLesson);
      window.removeEventListener("storage", handleStorage);
    };
  }, [lesson.id, showTakenOver]);

  useEffect(() => {
    if (!takenOver) return;
    resetLessonSession(lesson.id);
  }, [lesson.id, resetLessonSession, takenOver]);

  useEffect(() => {
    if (!hasHydrated || restoredLessonRef.current === lesson.id) return;
    restoredLessonRef.current = lesson.id;
    editedDuringRestoreRef.current = false;
    let active = true;
    const storedSessions = useAppStore.getState().lessonSessions;
    const canonicalSession = normalizeLessonSession(
      lesson.id,
      storedSessions[lesson.id] ?? createEmptyLessonSession(lesson.id),
    );
    const routeSession = storedSessions[routeLessonId];
    const selected = routeSession
      ? preferDurableSession(
          canonicalSession,
          normalizeLessonSession(lesson.id, routeSession),
        )
      : canonicalSession;
    const fallback = restartIncompleteLessonPhase(selected);

    queueMicrotask(() => {
      if (!active) return;
      setSession(fallback);
      setElapsedSeconds(fallback.elapsedSeconds);
      if (routeLessonId !== lesson.id && routeSession) {
        saveLessonSession(fallback);
      }
    });

    void restoreLessonProgress(lesson, fallback)
      .then((restored) => {
        if (!active || editedDuringRestoreRef.current) return;
        if (restored.completed && restored.completionResult) {
          saveLessonSession(restored);
          router.replace(`/lesson/${lesson.id}/complete`);
          return;
        }
        const durable = preferDurableSession(fallback, restored);
        setSession(durable);
        setElapsedSeconds(durable.elapsedSeconds);
        saveLessonSession(durable);

        // The Story page finishes Story and hands the player a session that
        // already lists it as complete, but that claim only ever existed in
        // this browser -- it never reached the database. Trusting it meant
        // Story was never committed, so every later section failed the
        // ordering gate with "Previous lesson phase is not committed" and
        // retried forever behind a banner blaming the connection.
        //
        // Committing Story here closes that gap and repairs sessions already
        // stuck in it: the commit writes the checkpoint first, and that is what
        // carries storyComplete to the server. Repeating it is safe -- an
        // already-committed section comes back as a duplicate, not a second
        // award.
        if (durable.storyComplete && !durable.completed && !storyCommitRef.current) {
          storyCommitRef.current = true;
          const queued = queueLessonPhaseCompletion(lesson, durable, "story");
          if (queued.queued) {
            void queued.completion
              .then((ok) => {
                if (!ok) storyCommitRef.current = false;
              })
              .catch(() => {
                storyCommitRef.current = false;
              });
          } else {
            storyCommitRef.current = false;
          }
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hasHydrated, lesson, routeLessonId, router, saveLessonSession]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setElapsedSeconds((value) => value + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    // A lesson that has been set aside must not write itself back on the way
    // out, or leaving the page would restore what was just dropped.
    if (!session || takenOver) return;
    /**
     * Leaving saves; it does not argue.
     *
     * This used to call preventDefault, which is what raised the browser's
     * "Changes you made may not be saved" prompt — including on the way to the
     * results screen, so finishing a lesson ended in a warning that the work
     * might be lost at the exact moment it had just been committed.
     *
     * The prompt protected nothing. The line above it writes the session to
     * local storage synchronously, before the browser could show anything, and
     * an unsent section is already durable in the sync queue and retries on the
     * next visit. So the only thing the prompt could change was whether the
     * learner had to click twice.
     */
    const handleBeforeUnload = () => {
      saveLessonSession({ ...session, elapsedSeconds });
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") {
        // Coming back to a tab is when a learner would otherwise start a whole
        // section they had already lost, so this is where AIko checks whether
        // the lesson is still theirs.
        void confirmLessonStanding(lesson);
        return;
      }
      const checkpoint = { ...session, elapsedSeconds };
      saveLessonSession(checkpoint);
      void syncLessonProgress(lesson, checkpoint).catch(() => false);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [elapsedSeconds, lesson, saveLessonSession, session, takenOver]);

  const updateSession = useCallback(
    (next: LessonSession) => {
      editedDuringRestoreRef.current = true;
      const withTime = { ...next, elapsedSeconds };
      setSession(withTime);
      saveLessonSession(withTime);
      return withTime;
    },
    [elapsedSeconds, saveLessonSession],
  );

  const phase = lesson.phases[session?.currentPhaseIndex ?? 0];
  const premiumPhase =
    !premiumPhasesAccessible && isPremiumPhase(phase.id) ? phase.id : null;
  const protectedPractice: ProtectedPractice | null = premiumPhase;
  const canContinue = useMemo(
    () =>
      session && !protectedPractice
        ? phaseIsComplete(session, phase.id, lesson)
        : false,
    [lesson, phase.id, protectedPractice, session],
  );
  const isLastPhase = session
    ? session.currentPhaseIndex === lesson.phases.length - 1
    : false;
  const progress = session
    ? Math.round(
        ((session.currentPhaseIndex + (canContinue ? 1 : 0.35)) /
          lesson.phases.length) *
          100,
      )
    : 0;

  if (takenOver) {
    return <LessonTakenOver />;
  }

  if (!hasHydrated || !session) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-paper"
        aria-live="polite"
      >
        <div className="text-center">
          <span className="mx-auto block size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" />
          <p className="mt-4 text-sm font-semibold text-stone-500">
            Loading your lesson…
          </p>
        </div>
      </main>
    );
  }

  async function commitAndAdvance(
    currentPhaseId: LessonPhaseId,
    base: LessonSession,
    skipped = false,
  ) {
    if (isCommitting || advancingRef.current) return;
    advancingRef.current = true;
    setCommitError(null);

    const phaseSnapshot = {
      ...base,
      elapsedSeconds,
      skippedPhaseIds: skipped
        ? Array.from(new Set([...(base.skippedPhaseIds ?? []), currentPhaseId]))
        : (base.skippedPhaseIds ?? []),
    };
    const completedPhaseIds = Array.from(
      new Set([...phaseSnapshot.completedPhaseIds, currentPhaseId]),
    );
    const completedActivity = {
      ...phaseSnapshot.activities,
      [currentPhaseId]: {
        phaseId: currentPhaseId,
        activityIndex: phaseSnapshot.activityIndex,
        completed: true,
        attempts: phaseSnapshot.activities[currentPhaseId]?.attempts ?? 1,
      },
    };

    const lastPhase = phaseSnapshot.currentPhaseIndex === lesson.phases.length - 1;

    if (!skipped && !lastPhase) {
      // The phase snapshot is queued before the optimistic transition. It is
      // durable in local storage and retries in phase order if the network or
      // canonical mastery commit fails.
      const backgroundCommit = queueLessonPhaseCompletion(
        lesson,
        phaseSnapshot,
        currentPhaseId,
      );
      if (!backgroundCommit.queued) {
        setCommitError(
          "AIko could not safely queue this section on your device. Free some browser storage, then try again.",
        );
        advancingRef.current = false;
        return;
      }
      const nextIndex = phaseSnapshot.currentPhaseIndex + 1;
      updateSession({
        ...phaseSnapshot,
        completedPhaseIds,
        activities: completedActivity,
        currentPhaseIndex: nextIndex,
        activityIndex: 0,
        completionState: "active",
        completed: false,
        completionResult: null,
      });
      advancingRef.current = false;
      // Say what actually went wrong. A save that can never succeed looked
      // exactly like one waiting on a slow network, so the learner kept
      // pressing Retry against a failure that had a specific, fixable cause.
      const describeFailure = () => {
        if (lessonWasSuperseded(lesson.id)) {
          showTakenOver();
          return;
        }
        const reason = pendingLessonPhaseError(lesson.id);
        setBackgroundSaveError(
          reason
            ? `Your previous section is safe on this device, but AIko refused it: ${reason}`
            : "Your previous section is safe on this device, but it has not reached AIko yet.",
        );
      };
      void backgroundCommit.completion
        .then((synced) => {
          if (synced) {
            setBackgroundSaveError(null);
            return;
          }
          describeFailure();
        })
        .catch(describeFailure);
      return;
    }

    setIsCommitting(true);
    let committed = false;
    try {
      if (skipped) {
        const previousSaved = await flushPendingLessonPhaseCommits(lesson.id);
        if (!previousSaved) {
          throw new Error(
            "The previous section is still waiting to save. Retry that save before skipping this section.",
          );
        }
        committed = await syncLessonSectionSkip(
          lesson,
          phaseSnapshot,
          currentPhaseId,
        );
      } else if (base.completionState === "completion_pending") {
        committed = await flushPendingLessonPhaseCommits(lesson.id);
      } else {
        const queuedCommit = queueLessonPhaseCompletion(
          lesson,
          phaseSnapshot,
          currentPhaseId,
        );
        if (!queuedCommit.queued) {
          throw new Error(
            "AIko could not safely queue this section on your device. Free some browser storage, then try again.",
          );
        }
        committed = await queuedCommit.completion;
      }
    } catch (error) {
      if (isLessonSupersededError(error) || lessonWasSuperseded(lesson.id)) {
        showTakenOver();
        setIsCommitting(false);
        advancingRef.current = false;
        return;
      }
      setCommitError(
        error instanceof Error
          ? error.message
          : "This section could not be saved. Please try again.",
      );
      setIsCommitting(false);
      advancingRef.current = false;
      return;
    }
    if (!committed) {
      setCommitError(
        lastPhase
          ? pendingLessonPhaseError(lesson.id) ??
              "Your answers are safe on this device, but AIko still needs to save them before showing results."
          : "We couldn't safely save this section yet. Please try again.",
      );
      if (!skipped && lastPhase && base.completionState !== "completion_pending") {
        updateSession({
          ...phaseSnapshot,
          completedPhaseIds,
          activities: completedActivity,
          activityIndex: 0,
          completionResult: null,
          completionState: "completion_pending",
          completed: false,
        });
      }
      setIsCommitting(false);
      advancingRef.current = false;
      return;
    }

    if (lastPhase) {
      const pending = base.completionState === "completion_pending"
        ? base
        : updateSession({
            ...phaseSnapshot,
            completedPhaseIds,
            activities: completedActivity,
            activityIndex: 0,
            completionResult: null,
            completionState: "completion_pending",
            completed: false,
          });
      const fallbackResult = completionForAccess(
        lesson,
        pending,
        premiumPhasesAccessible,
      );
      let canonicalResult = null;
      try {
        canonicalResult = await syncLessonCompletion(
          lesson,
          pending,
          fallbackResult,
        );
      } catch (error) {
        if (isLessonSupersededError(error) || lessonWasSuperseded(lesson.id)) {
          showTakenOver();
          setIsCommitting(false);
          advancingRef.current = false;
          return;
        }
        setCommitError(
          error instanceof Error
            ? error.message
            : "Lesson completion could not be confirmed. Please try again.",
        );
        setIsCommitting(false);
        advancingRef.current = false;
        return;
      }

      if (!canonicalResult) {
        setCommitError(
          "The phase is saved, but lesson completion wasn't confirmed. Retry to finish — no XP or mastery will be duplicated.",
        );
        setIsCommitting(false);
        advancingRef.current = false;
        return;
      }

      const latest =
        useAppStore.getState().lessonSessions[lesson.id] ?? pending;
      const completedSession: LessonSession = {
        ...latest,
        completedPhaseIds,
        activities: completedActivity,
        completionResult: canonicalResult,
        completionState: "completed",
        completed: true,
      };
      setSession(completedSession);
      saveLessonSession(completedSession);
      setIsCommitting(false);
      advancingRef.current = false;
      router.push(`/lesson/${lesson.id}/complete`);
      return;
    }

    const nextIndex = phaseSnapshot.currentPhaseIndex + 1;
    updateSession({
      ...phaseSnapshot,
      completedPhaseIds,
      activities: completedActivity,
      currentPhaseIndex: nextIndex,
      activityIndex: 0,
      completionState: "active",
      completed: false,
      completionResult: null,
    });
    setIsCommitting(false);
    advancingRef.current = false;
  }

  async function retryBackgroundSaves() {
    if (isRetryingBackgroundSave) return;
    setIsRetryingBackgroundSave(true);
    const synced = await flushPendingLessonPhaseCommits(lesson.id).catch(
      () => false,
    );
    if (lessonWasSuperseded(lesson.id)) {
      showTakenOver();
      setIsRetryingBackgroundSave(false);
      return;
    }
    // The queue records why each attempt failed, and the repository maps the
    // server's phase rules to something a learner can act on. Blaming the
    // connection for a rule failure sent them round a retry that could not
    // succeed, with nothing on screen naming the real problem.
    setBackgroundSaveError(
      synced
        ? null
        : pendingLessonPhaseError(lesson.id) ??
            "Your previous section is still safe here. Check your connection and retry the save.",
    );
    setIsRetryingBackgroundSave(false);
  }

  function skipSection() {
    if (!session || isCommitting) return;
    setShowSkip(false);
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    void commitAndAdvance(currentPhase.id, session, true);
  }

  function continueLesson() {
    if (!session || !canContinue || isCommitting) return;
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    void commitAndAdvance(currentPhase.id, session);
  }

  function skipProtectedPractice() {
    if (!session || isCommitting || premiumPhasesAccessible) return;
    if (premiumPhase) {
      void commitAndAdvance(premiumPhase, session, true);
    }
  }

  async function leaveLesson() {
    if (!session || isLeaving || isCommitting) return;
    setIsLeaving(true);

    const checkpoint = restartIncompleteLessonPhase({
      ...session,
      elapsedSeconds,
    });
    saveLessonSession(checkpoint);
    await syncLessonProgress(lesson, checkpoint).catch(() => false);
    router.replace("/learn");
  }

  return (
    <>
      <LessonPlayerShell
        lessonTitle={lesson.title}
        phaseName={phase.label}
        phaseNumber={session.currentPhaseIndex + 1}
        totalPhases={lesson.phases.length}
        progress={progress}
        canContinue={canContinue && !isCommitting}
        skipDisabled={isCommitting}
        continueLabel={
          isCommitting
            ? "Saving…"
            : isLastPhase
              ? session.completionState === "completion_pending"
                ? "Retry completion"
                : "See results"
              : nextLabel(phase.id)
        }
        onSkip={() => setShowSkip(true)}
        onContinue={continueLesson}
        onExit={() => setShowExit(true)}
      >
        <div className="mb-5 flex justify-end">
          <LessonReportDialog
            lessonId={lesson.id}
            lessonTitle={lesson.title}
            phase={phase.label}
            activityId={`${phase.id}_${session.activityIndex}`}
            compact
          />
        </div>

        {commitError ? (
          <div
            className="mb-6 flex items-start gap-3 rounded-2xl border border-persimmon-200 bg-persimmon-50 p-4 text-sm text-persimmon-900"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p>{commitError}</p>
          </div>
        ) : null}

        {backgroundSaveError ? (
          <div
            className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
            role="status"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <p>{backgroundSaveError} You can keep learning while it retries.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={isRetryingBackgroundSave}
              onClick={() => void retryBackgroundSaves()}
            >
              {isRetryingBackgroundSave ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              Retry save
            </Button>
          </div>
        ) : null}

        {protectedPractice ? (
          <PremiumPracticeGate
            practice={protectedPractice}
            busy={isCommitting}
            onSkip={skipProtectedPractice}
          />
        ) : (
          <>
            {phase.id === "story" && (
              <StoryPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
            {phase.id === "vocabulary" && (
              <VocabularyPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
            {phase.id === "grammar" && (
              <GrammarPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
            {phase.id === "reading" && (
              <ReadingPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
            {phase.id === "listening" && (
              <ListeningPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
            {phase.id === "speaking" && (
              <SpeakingPhase
                lesson={lesson}
                session={session}
                onChange={updateSession}
              />
            )}
          </>
        )}
      </LessonPlayerShell>

      {showSkip && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-title"
        >
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float">
            <span className="grid size-12 place-items-center rounded-2xl bg-sand text-persimmon-700">
              <AlertTriangle className="size-5" />
            </span>
            <h2 id="skip-title" className="mt-6 text-2xl font-semibold">
              Skip {phase.label}?
            </h2>
            <p className="mt-3 leading-7 text-stone-500">
              This whole section will count as zero and cannot be reopened in
              this lesson. You will move straight to the next section.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => setShowSkip(false)}
              >
                Keep learning
              </Button>
              <Button
                type="button"
                className="flex-1 bg-persimmon-500 hover:bg-persimmon-600"
                onClick={skipSection}
              >
                Skip {phase.label}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showExit && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-title"
        >
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float">
            <span className="grid size-12 place-items-center rounded-2xl bg-persimmon-100 text-persimmon-600">
              <AlertTriangle className="size-5" />
            </span>
            <h2 id="exit-title" className="mt-6 text-2xl font-semibold">
              Leave for now?
            </h2>
            <p className="mt-3 leading-7 text-stone-500">
              Completed phases stay saved. Your current unfinished phase will
              restart from its first activity when you return. Leaving does not
              refund or consume another daily lesson.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                disabled={isLeaving}
                onClick={() => setShowExit(false)}
              >
                Stay in lesson
              </Button>
              <Button
                type="button"
                className="flex-1 bg-persimmon-500 hover:bg-persimmon-600"
                disabled={isLeaving}
                onClick={() => void leaveLesson()}
              >
                {isLeaving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                {isLeaving ? "Saving…" : "Save & leave"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * What the browser left behind shows instead of a lesson.
 *
 * Deliberately a full stop rather than a banner over a playable lesson: every
 * answer given here from now on would be thrown away, so offering to carry on
 * would be a lie, and the Retry button that used to sit here was worse — it
 * reopened this lesson and closed the one the learner had actually moved to.
 */
function LessonTakenOver() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper p-6">
      <div className="w-full max-w-lg rounded-4xl bg-white p-8 text-center shadow-card sm:p-10">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <AlertTriangle className="size-5" />
        </span>
        <p className="section-kicker mt-6">Lesson set aside</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          You have a newer lesson open
        </h1>
        <p className="mt-4 leading-7 text-stone-500">
          AIko keeps one lesson going at a time, so this one was set aside when
          the newer one started somewhere else. It has left your path.
        </p>
        <p className="mt-3 leading-7 text-stone-500">
          Every section you finished here still counts — that mastery was
          recorded as you earned it.
        </p>
        <ButtonLink href="/learn" className="mt-7">
          Go to my lesson
        </ButtonLink>
      </div>
    </main>
  );
}

function PremiumPracticeGate({
  practice,
  busy,
  onSkip,
}: {
  practice: ProtectedPractice;
  busy: boolean;
  onSkip: () => void;
}) {
  const Icon = practice === "listening" ? Headphones : Mic2;
  const label = practice === "listening" ? "Listening" : "Speaking";

  return (
    <div className="mx-auto max-w-2xl rounded-4xl border border-persimmon-200 bg-white p-7 text-center shadow-card sm:p-10">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-600">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-persimmon-700">
        <Crown className="size-4" aria-hidden="true" />
        Premium practice
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {label} is available with Premium.
      </h2>
      <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
        Subscribe to practice {label.toLowerCase()} now, or skip it and keep
        moving forward. Skipping protected practice does not block lesson
        completion and awards no protected mastery.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/subscription" className="sm:min-w-36">
          Subscribe
        </ButtonLink>
        <Button
          type="button"
          variant="secondary"
          className="sm:min-w-36"
          disabled={busy}
          onClick={onSkip}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {busy ? "Saving…" : "Skip"}
        </Button>
      </div>
    </div>
  );
}

function nextLabel(phaseId: LessonPhaseId): string {
  const labels: Record<LessonPhaseId, string> = {
    story: "Vocabulary",
    vocabulary: "Grammar",
    grammar: "Reading",
    reading: "Listening",
    listening: "Speaking",
    speaking: "Results",
  };
  return labels[phaseId];
}
