"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { LessonPackage } from "@/types/lesson";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";
import { calculateLessonCompletion } from "@/lib/scoring-utils";
import {
  normalizeLessonSession,
  useAppStore,
} from "@/store/app-store";
import { Button } from "@/components/ui/button";
import { LessonPlayerShell } from "@/components/lesson/lesson-player-shell";
import { StoryPhase } from "@/components/lesson/story-phase";
import { VocabularyPhase } from "@/components/lesson/vocabulary-phase";
import { GrammarPhase } from "@/components/lesson/grammar-phase";
import { ReadingPhase } from "@/components/lesson/reading-phase";
import { ListeningPhase } from "@/components/lesson/listening-phase";
import { SpeakingPhase } from "@/components/lesson/speaking-phase";
import { FinalReviewPhase } from "@/components/lesson/final-review-phase";
import { LessonReportDialog } from "@/components/support/lesson-report-dialog";
import {
  restoreLessonProgress,
  syncLessonProgress,
} from "@/lib/sync/backend-sync";

export function LessonPlayer({ lesson }: { lesson: LessonPackage }) {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const persistedSession = useAppStore((state) => state.lessonSessions[lesson.id]);
  const startOrResumeLesson = useAppStore((state) => state.startOrResumeLesson);
  const saveLessonSession = useAppStore((state) => state.saveLessonSession);
  const [session, setSession] = useState<LessonSession | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExit, setShowExit] = useState(false);
  const restoredLessonRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasHydrated || restoredLessonRef.current === lesson.id) return;
    restoredLessonRef.current = lesson.id;
    let active = true;
    const fallback = normalizeLessonSession(
      lesson.id,
      persistedSession ?? startOrResumeLesson(lesson.id),
    );
    void restoreLessonProgress(lesson, fallback).then((next) => {
      if (!active) return;
      if (next.completed && next.completionResult) {
        router.replace(`/lesson/${lesson.id}/complete`);
        return;
      }
      setSession(next);
      setElapsedSeconds(next.elapsedSeconds);
      saveLessonSession(next);
    });
    return () => {
      active = false;
    };
  }, [
    hasHydrated,
    lesson,
    router,
    saveLessonSession,
    startOrResumeLesson,
  ]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
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
      void syncLessonProgress(lesson, withTime).catch(() => undefined);
    },
    [elapsedSeconds, lesson, saveLessonSession],
  );

  const phase = lesson.phases[session?.currentPhaseIndex ?? 0];
  const canContinue = useMemo(
    () => (session ? phaseIsComplete(session, phase.id, lesson) : false),
    [lesson, phase.id, session],
  );
  const progress = session ? Math.round(((session.currentPhaseIndex + (canContinue ? 1 : 0.35)) / lesson.phases.length) * 100) : 0;

  if (!hasHydrated || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper" aria-live="polite">
        <div className="text-center"><span className="mx-auto block size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" /><p className="mt-4 text-sm font-semibold text-stone-500">Restoring your lesson…</p></div>
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

  function continueLesson() {
    if (!session || !canContinue) return;
    const currentPhase = lesson.phases[session.currentPhaseIndex];
    if (currentPhase.id === "review") {
      const timedSession = { ...session, elapsedSeconds, completed: true };
      const result = calculateLessonCompletion(lesson, timedSession);
      const completeSession = { ...timedSession, completionResult: result };
      updateSession(completeSession);
      router.push(`/lesson/${lesson.id}/complete`);
      return;
    }
    const nextIndex = session.currentPhaseIndex + 1;
    const nextPhase = lesson.phases[nextIndex];
    updateSession({
      ...session,
      completedPhaseIds: Array.from(new Set([...session.completedPhaseIds, currentPhase.id])),
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
  }

  function exit() {
    if (!session) return;
    const checkpoint = { ...session, elapsedSeconds };
    saveLessonSession(checkpoint);
    void syncLessonProgress(lesson, checkpoint).catch(() => undefined);
    router.push(`/lesson/${lesson.id}/preview`);
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
        continueLabel={phase.id === "review" ? "See results" : nextLabel(phase.id)}
        onBack={back}
        onContinue={continueLesson}
        onExit={() => setShowExit(true)}
      >
        <div className="mb-5 flex justify-end">
          <LessonReportDialog lessonId={lesson.id} lessonTitle={lesson.title} phase={phase.label} activityId={`${phase.id}_${session.activityIndex}`} compact />
        </div>
        {phase.id === "story" && <StoryPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "vocabulary" && <VocabularyPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "grammar" && <GrammarPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "reading" && <ReadingPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "listening" && <ListeningPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "speaking" && <SpeakingPhase lesson={lesson} session={session} onChange={updateSession} />}
        {phase.id === "review" && <FinalReviewPhase lesson={lesson} session={session} onChange={updateSession} />}
      </LessonPlayerShell>

      {showExit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="exit-title">
          <div className="w-full max-w-md rounded-4xl bg-white p-7 shadow-float">
            <span className="grid size-12 place-items-center rounded-2xl bg-persimmon-100 text-persimmon-600"><AlertTriangle className="size-5" /></span>
            <h2 id="exit-title" className="mt-6 text-2xl font-semibold">Pause this lesson?</h2>
            <p className="mt-3 leading-7 text-stone-500">You can leave now and continue from {phase.label} when you return.</p>
            <div className="mt-6 flex gap-3">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowExit(false)}>Keep learning</Button>
              <Button type="button" className="flex-1" onClick={exit}>Exit lesson</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function phaseIsComplete(
  session: LessonSession,
  phaseId: LessonPhaseId,
  lesson: LessonPackage,
): boolean {
  switch (phaseId) {
    case "story":
      return session.storyComplete;
    case "vocabulary":
      return lesson.vocabularyQuestions.every((question) =>
        session.vocabularyAnswers.some((answer) => answer.questionId === question.id),
      );
    case "grammar":
      return lesson.grammarQuestions.every((question) =>
        session.grammarAnswers.some((answer) => answer.questionId === question.id),
      );
    case "reading":
      return session.readingComplete;
    case "listening":
      return session.listeningComplete;
    case "speaking":
      return session.speakingComplete;
    case "review":
      return session.reviewResult?.totalCount === lesson.reviewQuestions.length;
  }
}

function nextLabel(phaseId: LessonPhaseId): string {
  const labels: Record<LessonPhaseId, string> = {
    story: "Vocabulary",
    vocabulary: "Grammar",
    grammar: "Reading",
    reading: "Listening",
    listening: "Speaking",
    speaking: "Final review",
    review: "Results",
  };
  return labels[phaseId];
}
