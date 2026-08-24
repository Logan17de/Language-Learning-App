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
import {
  canonicalLessonId,
  lessonRepository,
} from "@/lib/repositories/lesson-repository";
import { lessonSessionRepository } from "@/lib/repositories/lesson-session-repository";
import { buildLegacyMasteryEvidence } from "@/lib/sync/legacy-mastery-evidence";
import {
  describesSupersededLesson,
  isLessonSupersededError,
  LessonSupersededError,
  lessonWasSuperseded,
  markLessonSuperseded,
} from "@/lib/sync/lesson-standing";
import {
  discardLessonSyncOperations,
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

/**
 * Stop trying to save a lesson this browser is no longer in.
 *
 * Nothing queued for it can be accepted, and the retries were the mechanism by
 * which the two browsers fought: each one reopened its own lesson and closed
 * the other's. Dropping the queue first means a listener woken by the
 * announcement finds it already clear.
 */
function retireSupersededLesson(lessonId: string): void {
  discardLessonSyncOperations(lessonId);
  markLessonSuperseded(lessonId);
}

/**
 * The id of this lesson's session on the server.
 *
 * This deliberately reads rather than opens. Opening is what a learner does by
 * clicking into a lesson, and it moves their one open slot; doing it here meant
 * every background retry moved the slot too, so a browser left behind on a
 * set-aside lesson kept pulling it back and the two never settled.
 *
 * A lesson with no session at all is the exception. That is work finished
 * before the browser ever reached the server — offline, or straight out of the
 * story — and there is no other lesson's slot to take, so it opens.
 */
async function lessonSessionId(lesson: LessonPackage): Promise<string> {
  // Raised from here rather than at each call site, so that whichever of them
  // discovers the takeover -- a queued section, a skip, the final commit -- the
  // lesson is retired exactly once and none of them can miss it.
  const givenUp = (): never => {
    retireSupersededLesson(lesson.id);
    throw new LessonSupersededError(lesson.id);
  };

  if (lessonWasSuperseded(lesson.id)) throw new LessonSupersededError(lesson.id);

  const lessonId = await canonicalLessonId(lesson.id);
  if (!lessonId.ok) throw new Error(lessonId.error.message);

  const existing = await lessonSessionRepository.resolveSession(lessonId.data);
  if (!existing.ok) throw new Error(existing.error.message);
  if (existing.data) {
    if (existing.data.status !== "active") givenUp();
    return existing.data.id;
  }

  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) throw new Error(canonical.error.message);
  const opened = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!opened.ok) {
    if (describesSupersededLesson(opened.error.message)) givenUp();
    throw new Error(opened.error.message);
  }
  return opened.data.id;
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
  if (!checkpoint.ok && describesSupersededLesson(checkpoint.error.message)) {
    retireSupersededLesson(lesson.id);
    throw new LessonSupersededError(lesson.id);
  }
  return checkpoint.ok;
}

async function persistCheckpointOnly(
  lesson: LessonPackage,
  session: LessonSession,
): Promise<boolean> {
  let sessionId: string;
  try {
    sessionId = await lessonSessionId(lesson);
  } catch {
    return false;
  }
  return saveCheckpoint(lesson, session, sessionId, false);
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
  const sessionId = await lessonSessionId(lesson);

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
  const sessionId = await lessonSessionId(lesson);
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
  const sessionId = await lessonSessionId(lesson);
  const result = await lessonSessionRepository.complete({
    sessionId,
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
  // Nothing to hold on to: this lesson belongs to whichever browser has it open
  // now, and queueing a checkpoint here would only be refused later.
  if (lessonWasSuperseded(lesson.id)) return false;

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

/**
 * Ask whether this browser is still in this lesson, and change nothing else.
 *
 * Without this a browser that has been taken over carries on looking normal
 * until the learner finishes a whole section, and only then finds out that
 * none of it counted. One cheap read when they come back to the tab spends the
 * question at the moment it can still save them the work.
 */
export async function confirmLessonStanding(lesson: LessonPackage): Promise<void> {
  if (getBackendMode() !== "supabase") return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  // lessonSessionId retires the lesson itself when the answer is no. Anything
  // else -- a dropped connection, a slow reply -- is not evidence of a takeover
  // and is deliberately left alone.
  await lessonSessionId(lesson).catch(() => undefined);
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
  // Opening the player is the act of claiming the one open lesson, so this is
  // the one place that still asks the server to move it. A browser returning to
  // a lesson that was set aside is refused here, and says so rather than
  // quietly starting the lesson over.
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) {
    if (describesSupersededLesson(backendSession.error.message)) {
      retireSupersededLesson(lesson.id);
    }
    return safeFallback;
  }

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

/** `lesson_phase_commit:<lessonId>:<phase>` — the lesson a queued item belongs to. */
function queuedLessonId(dedupeKey: string): string {
  return dedupeKey.split(":")[1] ?? "";
}

async function runPendingSync(): Promise<void> {
  if (getBackendMode() !== "supabase" || !navigator.onLine) return;
  // A section that will not commit must hold back the sections behind it, or a
  // later phase would pass a mastery boundary the earlier one never crossed.
  // It must not hold back a different lesson: one unfixable section used to
  // stop the queue outright, so every save for every lesson stayed unsent
  // behind it, for as long as it sat there.
  const blocked = new Set<string>();
  for (const operation of readSyncQueue()) {
    const payload = operationPayload(operation);
    if (
      operation.kind === "lesson_phase_commit" &&
      payload.lesson &&
      payload.session &&
      payload.phase
    ) {
      const lessonId = queuedLessonId(operation.dedupeKey);
      if (blocked.has(lessonId)) continue;
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
        // A lesson the learner has moved off cannot take this section, now or
        // ever. The lookup has already dropped what was queued for it; there is
        // nothing here to record a failed attempt against.
        if (isLessonSupersededError(error)) {
          blocked.add(lessonId);
          continue;
        }
        markSyncAttempt(
          operation.id,
          error instanceof Error ? error.message : "Retry failed.",
        );
      }
      blocked.add(lessonId);
      continue;
    }
    if (
      operation.kind !== "lesson_checkpoint" ||
      !payload.lesson ||
      !payload.session
    ) {
      removeSyncOperation(operation.id);
      continue;
    }
    if (blocked.has(queuedLessonId(operation.dedupeKey))) continue;
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
