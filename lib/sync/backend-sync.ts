"use client";

import type { LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import type { ReviewSession } from "@/types/review-session";
import type { Json } from "@/types/database";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { lessonSessionRepository } from "@/lib/repositories/lesson-session-repository";
import { reviewRepository } from "@/lib/repositories/review-repository";
import { enqueueSync, markSyncAttempt, readSyncQueue, removeSyncOperation, type SyncOperation } from "@/lib/sync/offline-queue";

function json(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

type MasteryItemType = "kanji" | "vocabulary" | "grammar";
type MasteryDimension = "meaning" | "recognition" | "pronunciation";
type MasterySignal =
  | "revealed_reading"
  | "revealed_meaning"
  | "correct"
  | "incorrect";

function masteryItemType(
  lesson: LessonPackage,
  itemKey: string,
): MasteryItemType | null {
  if (lesson.kanji.some((item) => item.libraryId === itemKey)) return "kanji";
  if (lesson.vocabulary.some((item) => item.libraryId === itemKey)) {
    return "vocabulary";
  }
  if (lesson.grammar.some((item) => item.libraryId === itemKey)) return "grammar";
  return null;
}

function masteryEvidence(
  lesson: LessonPackage,
  session: LessonSession,
): Json[] {
  const result: Json[] = [];
  const add = (input: {
    clientEventId: string;
    itemKey: string;
    dimension: MasteryDimension;
    signal: MasterySignal;
    data?: Record<string, unknown>;
  }) => {
    const itemType = masteryItemType(lesson, input.itemKey);
    if (!itemType) return;
    result.push(
      json({
        clientEventId: input.clientEventId,
        itemType,
        itemKey: input.itemKey,
        dimension: input.dimension,
        signal: input.signal,
        data: input.data ?? {},
      }),
    );
  };

  for (const interaction of session.storyInteractions) {
    if (
      interaction.type !== "reading-revealed" &&
      interaction.type !== "meaning-revealed"
    ) {
      continue;
    }
    const line = lesson.story.find((item) => item.id === interaction.lineId);
    const word =
      line?.words.find((item) => item.id === interaction.wordId) ??
      line?.words.find((item) => item.surface === interaction.term);
    if (!word?.libraryId) continue;
    if (interaction.type === "reading-revealed") {
      add({
        clientEventId: `story:${interaction.id}:recognition`,
        itemKey: word.libraryId,
        dimension: "recognition",
        signal: "revealed_reading",
        data: { surface: word.surface },
      });
    } else {
      add({
        clientEventId: `story:${interaction.id}:meaning`,
        itemKey: word.libraryId,
        dimension: "meaning",
        signal: "revealed_meaning",
        data: { surface: word.surface },
      });
      if (word.scriptType !== "kanji") {
        add({
          clientEventId: `story:${interaction.id}:recognition`,
          itemKey: word.libraryId,
          dimension: "recognition",
          signal: "revealed_meaning",
          data: { surface: word.surface },
        });
      }
    }
  }

  for (const answer of session.vocabularyAnswers) {
    const question = lesson.vocabularyQuestions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    const dimension: MasteryDimension =
      question.mode === "reading-meaning" ? "meaning" : "recognition";
    for (const itemKey of question.targetItemIds) {
      add({
        clientEventId: `vocabulary:${answer.questionId}:${itemKey}`,
        itemKey,
        dimension,
        signal: answer.correct ? "correct" : "incorrect",
        data: { selectedAnswer: answer.selectedAnswer, mode: question.mode },
      });
    }
  }

  for (const answer of session.grammarAnswers) {
    const question = lesson.grammarQuestions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    for (const itemKey of question.targetItemIds) {
      add({
        clientEventId: `grammar:${answer.questionId}:${itemKey}`,
        itemKey,
        dimension: "meaning",
        signal: answer.correct ? "correct" : "incorrect",
        data: { selectedAnswer: answer.selectedAnswer, skill: answer.skill },
      });
    }
  }

  for (const answer of session.reviewAnswers) {
    const question = lesson.reviewQuestions.find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    for (const itemKey of question.targetItemIds ?? []) {
      add({
        clientEventId: `review:${answer.questionId}:${itemKey}`,
        itemKey,
        dimension:
          answer.category === "speaking" ? "pronunciation" : "meaning",
        signal: answer.correct ? "correct" : "incorrect",
        data: { selectedAnswer: answer.selectedAnswer, category: answer.category },
      });
    }
  }

  return result;
}

async function persistLesson(lesson: LessonPackage, session: LessonSession, complete: boolean): Promise<boolean> {
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return false;
  const backendSession = await lessonSessionRepository.startOrResume(canonical.data.lesson.id, canonical.data.version.id);
  if (!backendSession.ok) return false;
  const answers = [
    ...session.vocabularyAnswers.map((answer) => ({
      lesson_session_id: backendSession.data.id,
      phase: "vocabulary",
      activity_id: answer.questionId,
      selected_answer: answer.selectedAnswer,
      correct: answer.correct,
      attempts: answer.attempts,
      answer_data: json({ mode: answer.mode }),
    })),
    ...session.grammarAnswers.map((answer) => ({
      lesson_session_id: backendSession.data.id,
      phase: "grammar",
      activity_id: answer.questionId,
      selected_answer: answer.selectedAnswer,
      correct: answer.correct,
      attempts: answer.attempts,
      answer_data: json({ type: answer.type, skill: answer.skill }),
    })),
    ...session.reviewAnswers.map((answer) => ({
      lesson_session_id: backendSession.data.id,
      phase: "review",
      activity_id: answer.questionId,
      selected_answer: answer.selectedAnswer,
      correct: answer.correct,
      attempts: 1,
      answer_data: json({ category: answer.category }),
    })),
  ];
  const events = [
    ...session.storyInteractions.map((event) => ({
      lesson_session_id: backendSession.data.id,
      client_event_id: `story:${event.id}`,
      phase: "story",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    })),
    ...session.readingEvents.map((event) => ({
      lesson_session_id: backendSession.data.id,
      client_event_id: `reading:${event.id}`,
      phase: "reading",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    })),
    ...session.listeningEvents.map((event) => ({
      lesson_session_id: backendSession.data.id,
      client_event_id: `listening:${event.id}`,
      phase: "listening",
      event_type: event.type,
      event_data: json(event),
      occurred_at: session.updatedAt,
    })),
    ...session.speakingEvents.map((event, index) => ({
      lesson_session_id: backendSession.data.id,
      client_event_id: `speaking:${event.id ?? index}`,
      phase: "speaking",
      event_type: "attempt",
      event_data: json(event),
      occurred_at: session.updatedAt,
    })),
  ];
  const [answersResult, eventsResult, masteryResult] = await Promise.all([
    lessonSessionRepository.saveAnswers(answers),
    lessonSessionRepository.saveEvents(events),
    lessonSessionRepository.recordMasteryEvidence(
      backendSession.data.id,
      masteryEvidence(lesson, session),
    ),
  ]);
  if (!answersResult.ok || !eventsResult.ok || !masteryResult.ok) return false;
  const phase = lesson.phases[session.currentPhaseIndex]?.id ?? "story";
  const checkpoint = await lessonSessionRepository.saveCheckpoint(backendSession.data.id, {
    current_phase: phase,
    current_phase_index: session.currentPhaseIndex,
    activity_index: session.activityIndex,
    elapsed_seconds: session.elapsedSeconds,
    checkpoint: json({ session }),
  });
  if (!checkpoint.ok) return false;
  if (complete && session.completionResult) {
    const result = await lessonSessionRepository.complete({
      sessionId: backendSession.data.id,
      score: session.completionResult.score,
      xp: session.completionResult.xpGained,
      durationMinutes: session.completionResult.durationMinutes,
      completionData: json({
        result: session.completionResult,
        metrics: {
          vocabulary_correct: session.vocabularyAnswers.filter((answer) => answer.correct).length,
          vocabulary_total: session.vocabularyAnswers.length,
          grammar_correct: session.grammarAnswers.filter((answer) => answer.correct).length,
          grammar_total: session.grammarAnswers.length,
          review_correct: session.reviewResult?.correctCount ?? 0,
          review_total: session.reviewResult?.totalCount ?? 0,
        },
      }),
    });
    return result.ok;
  }
  return true;
}

async function persistReview(session: ReviewSession, complete: boolean): Promise<boolean> {
  const backendSession = await reviewRepository.start();
  if (!backendSession.ok) return false;
  const answers = await reviewRepository.saveAnswers(backendSession.data.id, session.answers);
  if (!answers.ok) return false;
  if (!complete) return true;
  if (!session.result) return false;
  const result = await reviewRepository.complete({
    sessionId: backendSession.data.id,
    score: session.result.score,
    correctCount: session.result.correctCount,
    totalCount: session.result.totalCount,
    improvedItemIds: session.result.improvedItemIds,
    weakItemIds: session.result.weakItemIds,
    xp: session.result.xpEarned,
  });
  return result.ok;
}

export async function syncLessonProgress(lesson: LessonPackage, session: LessonSession): Promise<void> {
  if (getBackendMode() !== "supabase") return;
  const complete = Boolean(session.completed && session.completionResult);
  const kind = complete ? "lesson_completion" : "lesson_checkpoint";
  const key = `${kind}:${lesson.id}`;
  if (!navigator.onLine || !(await persistLesson(lesson, session, complete))) {
    enqueueSync(kind, key, json({ lesson, session }), navigator.onLine ? "Database request failed." : "Offline");
  }
}

export async function syncReviewCompletion(session: ReviewSession): Promise<void> {
  if (getBackendMode() !== "supabase" || !session.result) return;
  if (!navigator.onLine || !(await persistReview(session, true))) {
    enqueueSync("review_completion", `review_completion:${session.id}`, json({ session }), navigator.onLine ? "Database request failed." : "Offline");
  }
}

export async function syncReviewProgress(session: ReviewSession): Promise<void> {
  if (getBackendMode() !== "supabase" || session.completed) return;
  if (!navigator.onLine || !(await persistReview(session, false))) {
    enqueueSync("review_checkpoint", `review_checkpoint:${session.id}`, json({ session }), navigator.onLine ? "Database request failed." : "Offline");
  }
}

export async function restoreLessonProgress(lesson: LessonPackage, fallback: LessonSession): Promise<LessonSession> {
  if (getBackendMode() !== "supabase") return fallback;
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return fallback;
  const backendSession = await lessonSessionRepository.startOrResume(canonical.data.lesson.id, canonical.data.version.id);
  if (!backendSession.ok) return fallback;
  const checkpoint = backendSession.data.checkpoint;
  if (typeof checkpoint !== "object" || checkpoint === null || Array.isArray(checkpoint) || !("session" in checkpoint)) return fallback;
  const restored = checkpoint.session;
  if (typeof restored !== "object" || restored === null || Array.isArray(restored)
    || restored.lessonId !== lesson.id || typeof restored.currentPhaseIndex !== "number"
    || typeof restored.elapsedSeconds !== "number" || !Array.isArray(restored.completedPhaseIds)) return fallback;
  return restored as unknown as LessonSession;
}

function operationPayload(operation: SyncOperation): { lesson?: LessonPackage; session?: LessonSession | ReviewSession } {
  return typeof operation.payload === "object" && operation.payload !== null && !Array.isArray(operation.payload)
    ? operation.payload as unknown as { lesson?: LessonPackage; session?: LessonSession | ReviewSession }
    : {};
}

export async function retryPendingSync(): Promise<void> {
  if (getBackendMode() !== "supabase" || !navigator.onLine) return;
  for (const operation of readSyncQueue()) {
    const payload = operationPayload(operation);
    let synced = false;
    if ((operation.kind === "lesson_checkpoint" || operation.kind === "lesson_completion") && payload.lesson && payload.session) {
      synced = await persistLesson(payload.lesson, payload.session as LessonSession, operation.kind === "lesson_completion");
    } else if ((operation.kind === "review_checkpoint" || operation.kind === "review_completion") && payload.session) {
      synced = await persistReview(payload.session as ReviewSession, operation.kind === "review_completion");
    }
    if (synced) removeSyncOperation(operation.id);
    else markSyncAttempt(operation.id, "Retry failed.");
  }
}
