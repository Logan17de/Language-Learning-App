"use client";

import type { LessonPackage } from "@/types/lesson";
import type {
  LessonCompletionResult,
  LessonPhaseId,
  LessonSession,
} from "@/types/lesson-session";
import type { Json } from "@/types/database";
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

type MasteryItemType = "kanji" | "vocabulary" | "grammar";
type MasteryDimension = "meaning" | "recognition" | "pronunciation";
type MasterySignal =
  | "exposure"
  | "revealed_reading"
  | "revealed_meaning"
  | "correct"
  | "incorrect"
  | "pronunciation_correct"
  | "pronunciation_incorrect";

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

function activityPhase(
  lesson: LessonPackage,
  activityId: string,
): LessonPhaseId | null {
  if (lesson.story.some((item) => item.id === activityId)) return "story";
  if (lesson.vocabularyQuestions.some((item) => item.id === activityId)) {
    return "vocabulary";
  }
  if (lesson.grammarQuestions.some((item) => item.id === activityId)) {
    return "grammar";
  }
  if (
    activityId.startsWith("reading-passage:") ||
    (lesson.readingQuestions ?? []).some((item) => item.id === activityId)
  ) {
    return "reading";
  }
  if (lesson.listeningExercises.some((item) => item.id === activityId)) {
    return "listening";
  }
  if (lesson.speakingExercises.some((item) => item.id === activityId)) {
    return "speaking";
  }
  return null;
}

export function buildMasteryEvidence(
  lesson: LessonPackage,
  session: LessonSession,
  phaseId: LessonPhaseId,
): Json[] {
  const phaseComplete = session.completedPhaseIds.includes(phaseId);
  if (!phaseComplete) return [];

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

  const inspectableWords = [
    ...lesson.vocabularyQuestions.flatMap((item) => item.inspectableTerms),
    ...lesson.grammarQuestions.flatMap((item) => item.inspectableTerms),
    ...lesson.readingConversation.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
    ...lesson.listeningExercises.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
    ...lesson.speakingExercises.flatMap(
      (item) => item.inspectableTerms ?? [],
    ),
  ];

  for (const interaction of session.storyInteractions) {
    if (
      interaction.type !== "reading-revealed" &&
      interaction.type !== "meaning-revealed"
    ) {
      continue;
    }
    if (activityPhase(lesson, interaction.lineId) !== phaseId) continue;
    const line = lesson.story.find((item) => item.id === interaction.lineId);
    const word =
      line?.words.find((item) => item.id === interaction.wordId) ??
      line?.words.find((item) => item.surface === interaction.term) ??
      inspectableWords.find(
        (item) =>
          item.id === interaction.wordId ||
          item.libraryId === interaction.wordId ||
          item.surface === interaction.term,
      );
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

  const usedHelpForKanji = (activityId: string, character: string) =>
    session.storyInteractions.some(
      (interaction) =>
        interaction.lineId === activityId &&
        (interaction.type === "reading-revealed" ||
          interaction.type === "meaning-revealed") &&
        interaction.term?.includes(character) === true,
    );
  const addUnassistedKanji = (
    activityId: string,
    visibleText: string,
    data: Record<string, unknown>,
  ) => {
    for (const item of lesson.kanji) {
      if (
        !item.libraryId ||
        !visibleText.includes(item.character) ||
        usedHelpForKanji(activityId, item.character)
      ) {
        continue;
      }
      add({
        clientEventId: `${phaseId}:${activityId}:${item.libraryId}:unassisted`,
        itemKey: item.libraryId,
        dimension: "recognition",
        signal: "exposure",
        data: {
          ...data,
          character: item.character,
          answeredWithoutHelp: true,
        },
      });
    }
  };

  for (const answer of
    phaseId === "vocabulary" ? session.vocabularyAnswers : []) {
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
    addUnassistedKanji(
      question.id,
      [question.prompt, question.cue, ...question.choices].join("\n"),
      { answeredCorrectly: answer.correct, source: "vocabulary" },
    );
  }

  for (const answer of phaseId === "grammar" ? session.grammarAnswers : []) {
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
    addUnassistedKanji(
      question.id,
      [
        question.prompt,
        question.cue,
        question.hintFront,
        ...question.choices,
      ].join("\n"),
      { answeredCorrectly: answer.correct, source: "grammar" },
    );
  }

  for (const answer of phaseId === "reading" ? session.readingAnswers : []) {
    const question = (lesson.readingQuestions ?? []).find(
      (item) => item.id === answer.questionId,
    );
    if (!question) continue;
    addUnassistedKanji(question.id, question.question, {
      source: "reading",
    });
  }

  for (const event of
    phaseId === "listening" ? session.listeningEvents : []) {
    if (event.type !== "answer" || !event.questionId) continue;
    const exercise = lesson.listeningExercises.find(
      (item) => item.id === event.questionId,
    );
    if (!exercise) continue;
    addUnassistedKanji(
      exercise.id,
      [exercise.prompt, ...exercise.choices].join("\n"),
      { answeredCorrectly: event.correct === true, source: "listening" },
    );
  }

  for (const event of phaseId === "speaking" ? session.speakingEvents : []) {
    if (!event.evaluationAvailable) continue;
    const exercise = lesson.speakingExercises.find(
      (item) => item.id === event.exerciseId,
    );
    if (!exercise) continue;
    const score = Math.max(
      event.pronunciationConfidence,
      event.grammarAccuracy,
    );
    for (const itemKey of exercise.targetItemIds ?? []) {
      add({
        clientEventId: `speaking:${event.id}:${itemKey}`,
        itemKey,
        dimension: "pronunciation",
        signal:
          score >= 70 ? "pronunciation_correct" : "pronunciation_incorrect",
        data: {
          transcript: event.transcript ?? "",
          speechMatch: event.pronunciationConfidence,
          answerMatch: event.grammarAccuracy,
        },
      });
    }
    addUnassistedKanji(exercise.id, exercise.modelAnswer, {
      evaluationAvailable: event.evaluationAvailable === true,
      source: "speaking",
    });
  }

  return result;
}

async function persistLesson(
  lesson: LessonPackage,
  session: LessonSession,
  complete: boolean,
  masteryPhase?: LessonPhaseId,
): Promise<PersistLessonResult> {
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return { synced: false };
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) return { synced: false };
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
      masteryPhase ? buildMasteryEvidence(lesson, session, masteryPhase) : [],
    ),
  ]);
  if (!answersResult.ok || !eventsResult.ok || !masteryResult.ok) {
    return { synced: false };
  }
  const phase = lesson.phases[session.currentPhaseIndex]?.id ?? "story";
  const checkpoint = await lessonSessionRepository.saveCheckpoint(
    backendSession.data.id,
    {
      current_phase: phase,
      current_phase_index: session.currentPhaseIndex,
      activity_index: session.activityIndex,
      elapsed_seconds: session.elapsedSeconds,
      checkpoint: json({ session }),
    },
  );
  if (!checkpoint.ok) return { synced: false };
  if (complete && session.completionResult) {
    const result = await lessonSessionRepository.complete({
      sessionId: backendSession.data.id,
      score: session.completionResult.score,
      xp: session.completionResult.xpGained,
      durationMinutes: session.completionResult.durationMinutes,
      completionData: json({
        result: session.completionResult,
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
    return {
      synced: true,
      canonicalCompletion: canonicalCompletionResult(
        result.data,
        session.completionResult,
      ),
    };
  }
  return { synced: true };
}

async function syncLesson(
  lesson: LessonPackage,
  session: LessonSession,
  masteryPhase?: LessonPhaseId,
): Promise<PersistLessonResult> {
  if (getBackendMode() !== "supabase") {
    return {
      synced: true,
      canonicalCompletion: session.completionResult ?? undefined,
    };
  }
  const complete = Boolean(session.completed && session.completionResult);
  const kind = complete ? "lesson_completion" : "lesson_checkpoint";
  const key = `${kind}:${lesson.id}:${masteryPhase ?? "checkpoint"}`;
  if (!navigator.onLine) {
    enqueueSync(kind, key, json({ lesson, session, masteryPhase }), "Offline");
    return { synced: false };
  }
  const result = await persistLesson(
    lesson,
    session,
    complete,
    masteryPhase,
  );
  if (!result.synced) {
    enqueueSync(
      kind,
      key,
      json({ lesson, session, masteryPhase }),
      "Database request failed.",
    );
  }
  return result;
}

export async function syncLessonProgress(
  lesson: LessonPackage,
  session: LessonSession,
  masteryPhase?: LessonPhaseId,
): Promise<boolean> {
  return (await syncLesson(lesson, session, masteryPhase)).synced;
}

export async function syncLessonCompletion(
  lesson: LessonPackage,
  session: LessonSession,
  masteryPhase?: LessonPhaseId,
): Promise<LessonCompletionResult | null> {
  const result = await syncLesson(lesson, session, masteryPhase);
  return result.canonicalCompletion ?? null;
}

export async function restoreLessonProgress(
  lesson: LessonPackage,
  fallback: LessonSession,
): Promise<LessonSession> {
  if (getBackendMode() !== "supabase") return fallback;
  const canonical = await lessonRepository.getPlayable(lesson.id);
  if (!canonical.ok) return fallback;
  const backendSession = await lessonSessionRepository.startOrResume(
    canonical.data.lesson.id,
    canonical.data.version.id,
  );
  if (!backendSession.ok) return fallback;
  const checkpoint = backendSession.data.checkpoint;
  if (
    typeof checkpoint !== "object" ||
    checkpoint === null ||
    Array.isArray(checkpoint) ||
    !("session" in checkpoint)
  ) {
    return fallback;
  }
  const restored = checkpoint.session;
  if (
    typeof restored !== "object" ||
    restored === null ||
    Array.isArray(restored) ||
    restored.lessonId !== lesson.id ||
    typeof restored.currentPhaseIndex !== "number" ||
    typeof restored.elapsedSeconds !== "number" ||
    !Array.isArray(restored.completedPhaseIds)
  ) {
    return fallback;
  }
  return restored as unknown as LessonSession;
}

function operationPayload(operation: SyncOperation): {
  lesson?: LessonPackage;
  session?: LessonSession;
  masteryPhase?: LessonPhaseId;
} {
  return typeof operation.payload === "object" &&
    operation.payload !== null &&
    !Array.isArray(operation.payload)
    ? (operation.payload as unknown as {
        lesson?: LessonPackage;
        session?: LessonSession;
        masteryPhase?: LessonPhaseId;
      })
    : {};
}

export async function retryPendingSync(): Promise<void> {
  if (getBackendMode() !== "supabase" || !navigator.onLine) return;
  for (const operation of readSyncQueue()) {
    const payload = operationPayload(operation);
    const supported =
      operation.kind === "lesson_checkpoint" ||
      operation.kind === "lesson_completion";
    if (!supported || !payload.lesson || !payload.session) {
      removeSyncOperation(operation.id);
      continue;
    }
    const result = await persistLesson(
      payload.lesson,
      payload.session,
      operation.kind === "lesson_completion",
      payload.masteryPhase,
    );
    if (result.synced) removeSyncOperation(operation.id);
    else markSyncAttempt(operation.id, "Retry failed.");
  }
}
