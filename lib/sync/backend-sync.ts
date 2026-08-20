"use client";

import type { LessonPackage } from "@/types/lesson";
import type {
  LessonCompletionResult,
  LessonPhaseId,
  LessonSession,
} from "@/types/lesson-session";
import type { Json } from "@/types/database";
import { restartIncompleteLessonPhase } from "@/lib/lesson-resume";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { lessonSessionRepository } from "@/lib/repositories/lesson-session-repository";
import {
  enqueueSync,
  markSyncAttempt,
  readSyncQueue,
  removeSyncOperation,
  type SyncOperation,
} from "@/lib/sync/offline-queue";

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

type PersistLessonResult = {
  synced: boolean;
  canonicalCompletion?: LessonCompletionResult;
};

function canonicalCompletionResult(
  value: Json,
  fallback: LessonCompletionResult,
): LessonCompletionResult | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, Json | undefined>;
  if (record.canonical !== true) return undefined;
  const score = Number(record.score);
  const xpGained = Number(record.xp_awarded);
  const durationMinutes = Number(record.duration_minutes);
  if (
    !Number.isFinite(score) ||
    !Number.isFinite(xpGained) ||
    !Number.isFinite(durationMinutes)
  ) {
    return undefined;
  }
  return {
    ...fallback,
    score: Math.max(0, Math.min(100, Math.round(score))),
    xpGained: Math.max(0, Math.round(xpGained)),
    durationMinutes: Math.max(1, Math.round(durationMinutes)),
  };
}

function persistedCompletionResult(
  lessonId: string,
  value: {
    score: number;
    xp_awarded: number;
    duration_minutes: number;
    completed_at: string;
  },
): LessonCompletionResult {
  return {
    lessonId,
    score: Math.max(0, Math.min(100, Math.round(value.score))),
    xpGained: Math.max(0, Math.round(value.xp_awarded)),
    durationMinutes: Math.max(1, Math.round(value.duration_minutes)),
    recognitionChange: 0,
    pronunciationChange: 0,
    grammarUnderstandingChange: 0,
    grammarProductionChange: 0,
    weakItems: [],
    completedAt: value.completed_at,
  };
}

async function backendContext(lesson: LessonPackage) {
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return null;
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) return null;
  return { canonical: canonical.data, backendSession: backendSession.data };
}

function phaseAnswers(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
  backendSessionId: string,
) {
  if (phase === "vocabulary") {
    return session.vocabularyAnswers
      .filter((answer) =>
        lesson.vocabularyQuestions.some((question) => question.id === answer.questionId),
      )
      .map((answer) => ({
        lesson_session_id: backendSessionId,
        phase: "vocabulary",
        activity_id: answer.questionId,
        selected_answer: answer.selectedAnswer,
        correct: answer.correct,
        attempts: answer.attempts,
        answer_data: json({ mode: answer.mode }),
      }));
  }
  if (phase === "grammar") {
    return session.grammarAnswers
      .filter((answer) =>
        lesson.grammarQuestions.some((question) => question.id === answer.questionId),
      )
      .map((answer) => ({
        lesson_session_id: backendSessionId,
        phase: "grammar",
        activity_id: answer.questionId,
        selected_answer: answer.selectedAnswer,
        correct: answer.correct,
        attempts: answer.attempts,
        answer_data: json({ type: answer.type, skill: answer.skill }),
      }));
  }
  return [];
}

function phaseEvents(
  session: LessonSession,
  phase: LessonPhaseId,
  backendSessionId: string,
) {
  if (phase === "story") {
    return session.storyInteractions.map((event) => ({
      lesson_session_id: backendSessionId,
      client_event_id: `story:${event.id}`,
      phase: "story",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    }));
  }
  if (phase === "reading") {
    return session.readingEvents.map((event) => ({
      lesson_session_id: backendSessionId,
      client_event_id: `reading:${event.id}`,
      phase: "reading",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    }));
  }
  if (phase === "listening") {
    return session.listeningEvents.map((event) => ({
      lesson_session_id: backendSessionId,
      client_event_id: `listening:${event.id}`,
      phase: "listening",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    }));
  }
  if (phase === "speaking") {
    return session.speakingEvents.map((event, index) => ({
      lesson_session_id: backendSessionId,
      client_event_id: `speaking:${event.id ?? index}`,
      phase: "speaking",
      event_type: "attempt",
      event_data: json(event),
      occurred_at: session.updatedAt,
    }));
  }
  return [];
}

async function saveCheckpoint(
  lesson: LessonPackage,
  session: LessonSession,
  backendSessionId: string,
  preserveCurrentPhaseEvidence: boolean,
): Promise<boolean> {
  const checkpointSession = preserveCurrentPhaseEvidence
    ? session
    : restartIncompleteLessonPhase(session);
  const phase =
    lesson.phases[checkpointSession.currentPhaseIndex]?.id ?? "story";
  const checkpoint = await lessonSessionRepository.saveCheckpoint(
    backendSessionId,
    {
      current_phase: phase,
      current_phase_index: checkpointSession.currentPhaseIndex,
      // An incomplete phase always restores at its beginning.
      activity_index: preserveCurrentPhaseEvidence
        ? checkpointSession.activityIndex
        : 0,
      elapsed_seconds: checkpointSession.elapsedSeconds,
      checkpoint: json({ session: checkpointSession }),
    },
  );
  return checkpoint.ok;
}

async function persistCheckpointOnly(
  lesson: LessonPackage,
  session: LessonSession,
): Promise<boolean> {
  const context = await backendContext(lesson);
  if (!context) return false;
  return saveCheckpoint(lesson, session, context.backendSession.id, false);
}

async function persistPhaseCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  const context = await backendContext(lesson);
  if (!context) return false;
  const sessionId = context.backendSession.id;

  // Persist canonical evidence before asking the database to commit mastery.
  // These writes are deliberately sequential: a checkpoint/mastery boundary is
  // never advanced if answer/event persistence failed.
  const answers = await lessonSessionRepository.saveAnswers(
    phaseAnswers(lesson, session, phase, sessionId),
  );
  if (!answers.ok) return false;

  const events = await lessonSessionRepository.saveEvents(
    phaseEvents(session, phase, sessionId),
  );
  if (!events.ok) return false;

  // Reading answers and Story completion live in the checkpoint, so the
  // completed phase snapshot must be saved before canonical validation.
  if (!(await saveCheckpoint(lesson, session, sessionId, true))) return false;

  const committed = await lessonSessionRepository.commitPhase(sessionId, phase);
  return committed.ok;
}

async function persistCanonicalCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  fallback: LessonCompletionResult,
): Promise<PersistLessonResult> {
  const context = await backendContext(lesson);
  if (!context) return { synced: false };
  const result = await lessonSessionRepository.complete({
    sessionId: context.backendSession.id,
    score: fallback.score,
    xp: fallback.xpGained,
    durationMinutes: fallback.durationMinutes,
    completionData: json({
      result: fallback,
      metrics: {
        vocabulary_correct: session.vocabularyAnswers.filter(
          (answer) => answer.correct,
        ).length,
        vocabulary_total: session.vocabularyAnswers.length,
        grammar_correct: session.grammarAnswers.filter(
          (answer) => answer.correct,
        ).length,
        grammar_total: session.grammarAnswers.length,
      },
    }),
  });
  if (!result.ok) return { synced: false };
  const canonical = canonicalCompletionResult(result.data, fallback);
  return canonical
    ? { synced: true, canonicalCompletion: canonical }
    : { synced: false };
}

export async function syncLessonProgress(
  lesson: LessonPackage,
  session: LessonSession,
): Promise<boolean> {
  if (getBackendMode() !== "supabase") return true;

  const key = `lesson_checkpoint:${lesson.id}`;
  const safeSession = restartIncompleteLessonPhase(session);
  if (!navigator.onLine) {
    enqueueSync(
      "lesson_checkpoint",
      key,
      json({ lesson, session: safeSession }),
      "Offline",
    );
    return false;
  }
  const synced = await persistCheckpointOnly(lesson, safeSession);
  if (!synced) {
    enqueueSync(
      "lesson_checkpoint",
      key,
      json({ lesson, session: safeSession }),
      "Database request failed.",
    );
  }
  return synced;
}

/**
 * Commit one fully finished phase. In Supabase mode the UI must wait for true
 * before advancing locally; an offline or failed request leaves the phase open.
 */
export async function syncLessonPhaseCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  if (getBackendMode() !== "supabase") return true;
  if (!navigator.onLine) return false;
  return persistPhaseCompletion(lesson, session, phase);
}

/** Canonical lesson completion is never queued as an optimistic success. */
export async function syncLessonCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  fallback: LessonCompletionResult,
): Promise<LessonCompletionResult | null> {
  if (getBackendMode() !== "supabase") return fallback;
  if (!navigator.onLine) return null;
  const result = await persistCanonicalCompletion(lesson, session, fallback);
  return result.canonicalCompletion ?? null;
}

export async function loadCanonicalLessonCompletion(
  lesson: LessonPackage,
): Promise<LessonCompletionResult | null> {
  if (getBackendMode() !== "supabase") return null;
  const canonical = await lessonRepository.getPlayable(lesson.id);
  const lessonId = canonical.ok ? canonical.data.lesson.id : lesson.id;
  const result = await lessonSessionRepository.latestCompletion(lessonId);
  if (!result.ok || !result.data) return null;
  return persistedCompletionResult(lesson.id, result.data);
}

function checkpointSession(value: Json): LessonSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Json | undefined>;
  const checkpoint = record.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    return null;
  }
  const checkpointRecord = checkpoint as Record<string, Json | undefined>;
  const session = checkpointRecord.session;
  if (!session || typeof session !== "object" || Array.isArray(session)) return null;
  return session as unknown as LessonSession;
}

export async function restoreLessonProgress(
  lesson: LessonPackage,
  fallback: LessonSession,
): Promise<LessonSession> {
  const safeFallback = restartIncompleteLessonPhase(fallback);
  if (getBackendMode() !== "supabase") return safeFallback;
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return safeFallback;
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) return safeFallback;

  const reset = await lessonSessionRepository.resetIncompletePhase(
    backendSession.data.id,
  );
  if (!reset.ok) return safeFallback;
  const restored = checkpointSession(reset.data);
  if (!restored || restored.lessonId !== lesson.id) return safeFallback;
  return restartIncompleteLessonPhase(restored);
}

function operationPayload(operation: SyncOperation): {
  lesson?: LessonPackage;
  session?: LessonSession;
} {
  return typeof operation.payload === "object" &&
    operation.payload !== null &&
    !Array.isArray(operation.payload)
    ? (operation.payload as unknown as {
        lesson?: LessonPackage;
        session?: LessonSession;
      })
    : {};
}

export async function retryPendingSync(): Promise<void> {
  if (getBackendMode() !== "supabase" || !navigator.onLine) return;
  for (const operation of readSyncQueue()) {
    const payload = operationPayload(operation);
    if (
      operation.kind !== "lesson_checkpoint" ||
      !payload.lesson ||
      !payload.session
    ) {
      removeSyncOperation(operation.id);
      continue;
    }
    const synced = await persistCheckpointOnly(
      payload.lesson,
      restartIncompleteLessonPhase(payload.session),
    );
    if (synced) removeSyncOperation(operation.id);
    else markSyncAttempt(operation.id, "Retry failed.");
  }
}
