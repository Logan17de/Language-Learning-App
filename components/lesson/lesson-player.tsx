"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Crown,
  Headphones,
  Languages,
  LoaderCircle,
  Mic2,
} from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import { calculateLessonXp } from "@/lib/xp";
import {
  grammarStandardIsComplete,
  phaseIsComplete,
} from "@/lib/lesson-phase-progress";
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
import { GrammarPhase } from "@/components/lesson/grammar-phase";
import { ReadingPhase } from "@/components/lesson/reading-phase";
import { ListeningPhase } from "@/components/lesson/listening-phase";
import { SpeakingPhase } from "@/components/lesson/speaking-phase";
import { LessonReportDialog } from "@/components/support/lesson-report-dialog";
import { preloadListeningAudio } from "@/components/exercises/audio-control";
import {
  restoreLessonProgress,
  syncLessonCompletion,
  syncLessonPhaseCompletion,
  syncLessonProgress,
} from "@/lib/sync/backend-sync";

type ProtectedPractice = "translation" | "listening" | "speaking";

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
  // authority. Free learners skip protected Translation/Listening/Speaking.
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
  translationPremiumContractActive = true,
}: {
  lesson: LessonPackage;
  routeLessonId?: string;
  translationPremiumContractActive?: boolean;
}) {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const [session, setSession] = useState<LessonSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const restoredLessonRef = useRef<string | null>(null);
  const editedDuringRestoreRef = useRef(false);
  const premiumPhasesAccessible = lesson.premiumPhaseAccess !== "locked";

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
        setSession(restored);
        setElapsedSeconds(restored.elapsedSeconds);
        saveLessonSession(restored);
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
    if (!session) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      saveLessonSession({ ...session, elapsedSeconds });
      event.preventDefault();
    };
    const handleVisibility = () => {
      if (document.visibilityState !== "hidden") return;
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
  }, [elapsedSeconds, lesson, saveLessonSession, session]);

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
  const translationGate = Boolean(
    translationPremiumContractActive &&
      session &&
      !premiumPhasesAccessible &&
      phase.id === "grammar" &&
      grammarStandardIsComplete(session, lesson),
  );
  const protectedPractice: ProtectedPractice | null = translationGate
    ? "translation"
    : premiumPhase;
  const canContinue = useMemo(
    () =>
      session && !protectedPractice
        ? phaseIsComplete(
            session,
            phase.id,
            lesson,
            translationPremiumContractActive,
          )
        : false,
    [
      lesson,
      phase.id,
      protectedPractice,
      session,
      translationPremiumContractActive,
    ],
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

  function back() {
    if (isCommitting) return;
    setCommitError(null);
    setShowExit(true);
  }

  async function commitAndAdvance(
    currentPhaseId: LessonPhaseId,
    base: LessonSession,
  ) {
    if (isCommitting) return;
    setIsCommitting(true);
    setCommitError(null);

    const phaseSnapshot = { ...base, elapsedSeconds };
    const committed = await syncLessonPhaseCompletion(
      lesson,
      phaseSnapshot,
      currentPhaseId,
    ).catch(() => false);
    if (!committed) {
      setCommitError(
        "We couldn't safely save this phase yet. Your lesson is still open — try again when you're ready.",
      );
      setIsCommitting(false);
      return;
    }

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

    if (phaseSnapshot.currentPhaseIndex === lesson.phases.length - 1) {
      const pending = updateSession({
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
      const canonicalResult = await syncLessonCompletion(
        lesson,
        pending,
        fallbackResult,
      ).catch(() => null);

      if (!canonicalResult) {
        setCommitError(
          "The phase is saved, but lesson completion wasn't confirmed. Retry to finish — no XP or mastery will be duplicated.",
        );
        setIsCommitting(false);
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
  }

  function continueLesson() {
    if (!session || !canContinue || isCommitting) return;
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    void commitAndAdvance(currentPhase.id, session);
  }

  function skipProtectedPractice() {
    if (!session || isCommitting || premiumPhasesAccessible) return;
    if (translationGate) {
      void commitAndAdvance("grammar", session);
      return;
    }
    if (premiumPhase) {
      void commitAndAdvance(premiumPhase, session);
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
        continueLabel={
          isCommitting
            ? "Saving…"
            : isLastPhase
              ? session.completionState === "completion_pending"
                ? "Retry completion"
                : "See results"
              : nextLabel(phase.id)
        }
        onBack={back}
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

function PremiumPracticeGate({
  practice,
  busy,
  onSkip,
}: {
  practice: ProtectedPractice;
  busy: boolean;
  onSkip: () => void;
}) {
  const Icon =
    practice === "translation"
      ? Languages
      : practice === "listening"
        ? Headphones
        : Mic2;
  const label =
    practice === "translation"
      ? "Translation"
      : practice === "listening"
        ? "Listening"
        : "Speaking";

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
