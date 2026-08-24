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
import { buildLegacyMasteryEvidence } from "@/lib/sync/legacy-mastery-evidence";
import {
  enqueueSync,
  hasPendingLessonPhaseCommit,
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

/**
 * The same lookup, but it says what went wrong.
 *
 * A phase commit that cannot reach its session used to return a bare false,
 * which the retry loop recorded as "Retry failed." — so a section that would
 * never save looked identical to one waiting on a slow network, and the reason
 * was discarded at the one point where it was known.
 */
async function requireBackendContext(lesson: LessonPackage) {
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) {
    throw new Error(canonical.error.message);
  }
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) {
    throw new Error(backendSession.error.message);
  }
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
  if (phase === "reading") {
    const questions = lesson.readingQuestions ?? [];
    return session.readingAnswers
      .filter((answer) =>
        questions.some((question) => question.id === answer.questionId),
      )
      .map((answer) => {
        const question = questions.find((item) => item.id === answer.questionId);
        return {
          lesson_session_id: backendSessionId,
          phase: "reading",
          activity_id: answer.questionId,
          selected_answer: answer.response,
          // Display value only. The database never trusts this flag: the
          // Reading commit and final score both re-derive correctness by
          // comparing the immutable selected_answer against the canonical
          // lesson_reading_questions.answer.
          correct: (question?.answer ?? "").trim() === answer.response.trim(),
          attempts: 1,
          answer_data: json({ source: "reading" }),
        };
      });
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

function legacyPhaseBoundary(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): LessonSession {
  const completedPhaseIds = Array.from(
    new Set([...session.completedPhaseIds, phase]),
  );
  const currentIndex = lesson.phases.findIndex((item) => item.id === phase);
  const lastIndex = lesson.phases.length - 1;
  const nextIndex = currentIndex >= 0 && currentIndex < lastIndex
    ? currentIndex + 1
    : lastIndex;
  return {
    ...session,
    completedPhaseIds,
    currentPhaseIndex: nextIndex,
    activityIndex: 0,
    completionState:
      completedPhaseIds.length === lesson.phases.length
        ? "completion_pending"
        : "active",
    completionResult: null,
    completed: false,
  };
}

async function persistPhaseCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  const context = await requireBackendContext(lesson);
  const sessionId = context.backendSession.id;

  // Persist canonical evidence before asking the database to commit mastery.
  // These writes are deliberately sequential: a checkpoint/mastery boundary is
  // never advanced if answer/event persistence failed.
  const answers = await lessonSessionRepository.saveAnswers(
    phaseAnswers(lesson, session, phase, sessionId),
  );
  if (!answers.ok) throw new Error(answers.error.message);

  const events = await lessonSessionRepository.saveEvents(
    phaseEvents(session, phase, sessionId),
  );
  if (!events.ok) throw new Error(events.error.message);

  // Reading answers and Story completion live in the checkpoint, so the
  // completed phase snapshot must be saved before canonical validation.
  if (!(await saveCheckpoint(lesson, session, sessionId, true))) {
    throw new Error("This phase checkpoint could not be saved. Please try again.");
  }

  const committed = await lessonSessionRepository.commitPhase(sessionId, phase);
  if (!committed.ok) throw new Error(committed.error.message);
  if (committed.data !== null) return true;

  // Rollout bridge only: the frontend may be promoted while the shared DB still
  // predates commit_lesson_phase(). Reuse the historical mastery RPC, then save
  // the completed phase boundary in the old checkpoint format. Once the new RPC
  // exists this branch is unreachable, so validation failures cannot bypass the
  // canonical engine.
  const legacyEvidence = buildLegacyMasteryEvidence(lesson, session, phase);
  const legacyMastery = await lessonSessionRepository.recordLegacyMasteryEvidence(
    sessionId,
    legacyEvidence,
  );
  if (!legacyMastery.ok) return false;

  return saveCheckpoint(
    lesson,
    legacyPhaseBoundary(lesson, session, phase),
    sessionId,
    true,
  );
}

async function persistPhaseSkip(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  const context = await backendContext(lesson);
  if (!context) {
    throw new Error("This lesson session could not be loaded. Please try again.");
  }
  const sessionId = context.backendSession.id;
  // The RPC is the skip authority. Do not checkpoint the optimistic marker
  // before it succeeds, or a failed request could restore as zero-scored even
  // though no durable skipped commit exists.
  const preSkipSession = {
    ...session,
    skippedPhaseIds: (session.skippedPhaseIds ?? []).filter(
      (phaseId) => phaseId !== phase,
    ),
  };
  if (!(await saveCheckpoint(lesson, preSkipSession, sessionId, false))) {
    throw new Error("This section checkpoint could not be saved. Please try again.");
  }
  const skipped = await lessonSessionRepository.skipPhase(sessionId, phase);
  if (!skipped.ok) throw new Error(skipped.error.message);
  return true;
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
  if (!result.ok) throw new Error(result.error.message);
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
  // Never race an optimistic phase commit with a later checkpoint. The phase
  // queue owns ordering; its evidence must reach the server first.
  if (hasPendingLessonPhaseCommit(lesson.id)) {
    enqueueSync(
      "lesson_checkpoint",
      key,
      json({ lesson, session: safeSession }),
      "Waiting for the previous section to save.",
    );
    return false;
  }
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

/** Commit one fully finished phase immediately. Prefer the durable queue from UI. */
export async function syncLessonPhaseCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  if (getBackendMode() !== "supabase") return true;
  if (!navigator.onLine) return false;
  return persistPhaseCompletion(lesson, session, phase);
}

export function queueLessonPhaseCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): { queued: boolean; completion: Promise<boolean> } {
  if (getBackendMode() !== "supabase") {
    return { queued: true, completion: Promise.resolve(true) };
  }
  const dedupeKey = `lesson_phase_commit:${lesson.id}:${phase}`;
  const alreadyQueued = readSyncQueue().some(
    (item) => item.dedupeKey === dedupeKey,
  );
  const queued = alreadyQueued ||
    enqueueSync(
      "lesson_phase_commit",
      dedupeKey,
      json({ lesson, session, phase }),
      navigator.onLine ? undefined : "Offline",
    );
  if (!queued) {
    return { queued: false, completion: Promise.resolve(false) };
  }
  const stillQueued = () =>
    readSyncQueue().some((item) => item.dedupeKey === dedupeKey);

  // retryPendingSync joins a pass already running, and a pass only ever attempts
  // the first queued phase before stopping to preserve order. Either way the
  // pass that this call joins may have started before this section was queued,
  // or may have spent itself on an earlier one -- so the section would be
  // reported as failed without anything having been tried. Run a second pass in
  // that case, and only then believe it.
  const completion = navigator.onLine
    ? retryPendingSync()
        .then(() => (stillQueued() ? retryPendingSync() : undefined))
        .then(() => !stillQueued())
    : Promise.resolve(false);
  return { queued: true, completion };
}

export async function flushPendingLessonPhaseCommits(
  lessonId: string,
): Promise<boolean> {
  if (getBackendMode() !== "supabase") return true;
  if (!navigator.onLine) return false;
  await retryPendingSync();
  return !hasPendingLessonPhaseCommit(lessonId);
}

/** Skip one whole section. The database records an explicit zero-score commit. */
export async function syncLessonSectionSkip(
  lesson: LessonPackage,
  session: LessonSession,
  phase: LessonPhaseId,
): Promise<boolean> {
  if (getBackendMode() !== "supabase") return true;
  if (!navigator.onLine) {
    throw new Error("Connect to the internet before skipping a section.");
  }
  return persistPhaseSkip(lesson, session, phase);
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
  if (hasPendingLessonPhaseCommit(lesson.id)) {
    await retryPendingSync();
    // Do not let reset_incomplete_lesson_phase erase evidence that is still in
    // the durable client queue. The local boundary remains the restore source
    // until every pending phase has reached the canonical server.
    if (hasPendingLessonPhaseCommit(lesson.id)) return safeFallback;
  }
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

  const resetPayload = reset.data ?? json({
    checkpoint: backendSession.data.checkpoint,
  });
  const restored = checkpointSession(resetPayload);
  if (!restored || restored.lessonId !== lesson.id) return safeFallback;
  return restartIncompleteLessonPhase(restored);
}

function operationPayload(operation: SyncOperation): {
  lesson?: LessonPackage;
  session?: LessonSession;
  phase?: LessonPhaseId;
} {
  return typeof operation.payload === "object" &&
    operation.payload !== null &&
    !Array.isArray(operation.payload)
    ? (operation.payload as unknown as {
        lesson?: LessonPackage;
        session?: LessonSession;
        phase?: LessonPhaseId;
      })
    : {};
}

let retryInFlight: Promise<void> | null = null;

async function runPendingSync(): Promise<void> {
  if (getBackendMode() !== "supabase" || !navigator.onLine) return;
  for (const operation of readSyncQueue()) {
    const payload = operationPayload(operation);
    if (
      operation.kind === "lesson_phase_commit" &&
      payload.lesson &&
      payload.session &&
      payload.phase
    ) {
      try {
        const synced = await persistPhaseCompletion(
          payload.lesson,
          payload.session,
          payload.phase,
        );
        if (synced) {
          removeSyncOperation(operation.id);
          continue;
        }
        markSyncAttempt(operation.id, "This section was refused without a reason.");
      } catch (error) {
        markSyncAttempt(
          operation.id,
          error instanceof Error ? error.message : "Retry failed.",
        );
      }
      // Preserve phase ordering. A later checkpoint or phase must never pass a
      // failed mastery boundary.
      break;
    }
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

export function retryPendingSync(): Promise<void> {
  if (retryInFlight) return retryInFlight;
  retryInFlight = runPendingSync().finally(() => {
    retryInFlight = null;
  });
  return retryInFlight;
}
