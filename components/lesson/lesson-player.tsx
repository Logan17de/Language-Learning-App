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
  syncLessonProgress,
} from "@/lib/sync/backend-sync";

function preferAdvancedSession(
  local: LessonSession,
  candidate: LessonSession,
): LessonSession {
  if (local.completed !== candidate.completed) {
    return candidate.completed ? candidate : local;
  }
  if (local.currentPhaseIndex !== candidate.currentPhaseIndex) {
    return candidate.currentPhaseIndex > local.currentPhaseIndex
      ? candidate
      : local;
  }
  if (local.activityIndex !== candidate.activityIndex) {
    return candidate.activityIndex > local.activityIndex ? candidate : local;
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

  // Listening and Speaking are 20% of the canonical score. Free learners who
  // skip the gated phases are scored only on the four phases they can access.
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
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const [session, setSession] = useState<LessonSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const restoredLessonRef = useRef<string | null>(null);
  const premiumPhasesAccessible = lesson.premiumPhaseAccess !== "locked";

  useEffect(() => {
    if (!premiumPhasesAccessible) return;
    for (const exercise of lesson.listeningExercises) {
      void preloadListeningAudio({
        text: exercise.transcript,
        audioAssetId: exercise.audioAssetId,
        browserTts: lesson.runtimeAudio === "browser_tts",
      }).catch(() => undefined);
    }
  }, [lesson, premiumPhasesAccessible]);

  useEffect(() => {
    if (!hasHydrated || restoredLessonRef.current === lesson.id) return;
    restoredLessonRef.current = lesson.id;
    let active = true;
    const storedSessions = useAppStore.getState().lessonSessions;
    const canonicalSession = normalizeLessonSession(
      lesson.id,
      storedSessions[lesson.id] ?? createEmptyLessonSession(lesson.id),
    );
    const routeSession = storedSessions[routeLessonId];
    const fallback = routeSession
      ? preferAdvancedSession(
          canonicalSession,
          normalizeLessonSession(lesson.id, routeSession),
        )
      : canonicalSession;

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
        if (!active) return;
        const latestLocal = normalizeLessonSession(
          lesson.id,
          useAppStore.getState().lessonSessions[lesson.id] ?? fallback,
        );
        const local = preferAdvancedSession(latestLocal, fallback);
        const next = preferAdvancedSession(local, restored);
        if (next.completed && next.completionResult) {
          router.replace(`/lesson/${lesson.id}/complete`);
          return;
        }
        setSession(next);
        setElapsedSeconds(next.elapsedSeconds);
        saveLessonSession(next);
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
      saveLessonSession({ ...session, elapsedSeconds });
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [elapsedSeconds, saveLessonSession, session]);

  const updateSession = useCallback(
    (next: LessonSession) => {
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
  const canContinue = useMemo(
    () =>
      session && !premiumPhase
        ? phaseIsComplete(session, phase.id, lesson)
        : false,
    [lesson, phase.id, premiumPhase, session],
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
    if (!session) return;
    if (session.currentPhaseIndex === 0) {
      setShowExit(true);
      return;
    }
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    const previousIndex = session.currentPhaseIndex - 1;
    const previousPhase = lesson.phases[previousIndex];
    updateSession({
      ...session,
      activities: {
        ...session.activities,
        [currentPhase.id]: {
          phaseId: currentPhase.id,
          activityIndex: session.activityIndex,
          completed: phaseIsComplete(session, currentPhase.id, lesson),
          attempts: 1,
        },
      },
      currentPhaseIndex: previousIndex,
      activityIndex: session.activities[previousPhase.id]?.activityIndex ?? 0,
    });
  }

  function completeCurrentLesson(
    currentPhaseId: LessonPhaseId,
    base: LessonSession,
  ) {
    const timedSession = {
      ...base,
      elapsedSeconds,
      completed: true,
      completedPhaseIds: Array.from(
        new Set([...base.completedPhaseIds, currentPhaseId]),
      ),
    };
    const result = completionForAccess(
      lesson,
      timedSession,
      premiumPhasesAccessible,
    );
    const completeSession = { ...timedSession, completionResult: result };
    const saved = updateSession(completeSession);
    void syncLessonCompletion(lesson, saved, currentPhaseId)
      .then((canonicalResult) => {
        if (!canonicalResult) return;
        saveLessonSession({
          ...saved,
          completionResult: canonicalResult,
        });
      })
      .catch(() => undefined);
    router.push(`/lesson/${lesson.id}/complete`);
  }

  function continueLesson() {
    if (!session || !canContinue) return;
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    if (session.currentPhaseIndex === lesson.phases.length - 1) {
      completeCurrentLesson(currentPhase.id, session);
      return;
    }
    const nextIndex = session.currentPhaseIndex + 1;
    const nextPhase = lesson.phases[nextIndex];
    const saved = updateSession({
      ...session,
      completedPhaseIds: Array.from(
        new Set([...session.completedPhaseIds, currentPhase.id]),
      ),
      activities: {
        ...session.activities,
        [currentPhase.id]: {
          phaseId: currentPhase.id,
          activityIndex: session.activityIndex,
          completed: true,
          attempts: 1,
        },
      },
      currentPhaseIndex: nextIndex,
      activityIndex: session.activities[nextPhase.id]?.activityIndex ?? 0,
    });
    void syncLessonProgress(lesson, saved, currentPhase.id).catch(
      () => undefined,
    );
  }

  function skipPremiumPhase() {
    if (!session || premiumPhasesAccessible || !isPremiumPhase(phase.id)) {
      return;
    }

    const skipped = {
      ...session,
      completedPhaseIds: Array.from(
        new Set([...session.completedPhaseIds, phase.id]),
      ),
      activities: {
        ...session.activities,
        [phase.id]: {
          phaseId: phase.id,
          activityIndex: 0,
          completed: true,
          attempts: 0,
        },
      },
    };

    if (session.currentPhaseIndex === lesson.phases.length - 1) {
      completeCurrentLesson(phase.id, skipped);
      return;
    }

    const nextIndex = session.currentPhaseIndex + 1;
    const nextPhase = lesson.phases[nextIndex];
    const saved = updateSession({
      ...skipped,
      currentPhaseIndex: nextIndex,
      activityIndex: session.activities[nextPhase.id]?.activityIndex ?? 0,
    });
    void syncLessonProgress(lesson, saved, phase.id).catch(() => undefined);
  }

  async function leaveLesson() {
    if (!session || isLeaving) return;
    setIsLeaving(true);

    const checkpoint = {
      ...session,
      elapsedSeconds,
    };
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
        canContinue={canContinue}
        continueLabel={isLastPhase ? "See results" : nextLabel(phase.id)}
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

        {premiumPhase ? (
          <PremiumPhaseGate phase={premiumPhase} onSkip={skipPremiumPhase} />
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
              Your checkpoint stays saved. You can return to this same lesson
              from Learn and continue where you stopped. Leaving does not refund
              or consume another daily lesson.
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

function PremiumPhaseGate({
  phase,
  onSkip,
}: {
  phase: "listening" | "speaking";
  onSkip: () => void;
}) {
  const Icon = phase === "listening" ? Headphones : Mic2;
  const label = phase === "listening" ? "Listening" : "Speaking";

  return (
    <div className="mx-auto max-w-2xl rounded-4xl border border-persimmon-200 bg-white p-7 text-center shadow-card sm:p-10">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-600">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="mt-6 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-persimmon-700">
        <Crown className="size-4" aria-hidden="true" />
        Premium phase
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight">
        {label} is ready when you want it.
      </h2>
      <p className="mx-auto mt-3 max-w-xl leading-7 text-muted">
        AIko generated this phase as part of your lesson. Subscribe to Premium
        to practice it now, or skip it and continue. Skipping does not block
        lesson completion.
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <ButtonLink href="/subscription" className="sm:min-w-36">
          Subscribe
        </ButtonLink>
        <Button
          type="button"
          variant="secondary"
          className="sm:min-w-36"
          onClick={onSkip}
        >
          Skip
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
