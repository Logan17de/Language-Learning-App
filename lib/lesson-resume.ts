import type {
  LessonActivityProgress,
  LessonCompletionState,
  LessonPhaseId,
  LessonSession,
} from "@/types/lesson-session";

export const LESSON_PHASE_ORDER: readonly LessonPhaseId[] = [
  "story",
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "speaking",
];

export function canonicalCompletionState(
  session: Pick<LessonSession, "completed" | "completionResult"> &
    Partial<Pick<LessonSession, "completionState">>,
): LessonCompletionState {
  if (session.completed && session.completionResult) return "completed";
  return session.completionState === "completion_pending"
    ? "completion_pending"
    : "active";
}

export function contiguousCompletedPhases(
  phaseIds: readonly LessonPhaseId[],
): LessonPhaseId[] {
  const completed = new Set(phaseIds);
  const result: LessonPhaseId[] = [];
  for (const phaseId of LESSON_PHASE_ORDER) {
    if (!completed.has(phaseId)) break;
    result.push(phaseId);
  }
  return result;
}

function activity(
  session: LessonSession,
  phaseId: LessonPhaseId,
  completed: boolean,
): LessonActivityProgress {
  if (!completed) {
    return { phaseId, activityIndex: 0, completed: false, attempts: 0 };
  }
  const existing = session.activities[phaseId];
  return {
    phaseId,
    activityIndex: existing?.activityIndex ?? 0,
    completed: true,
    attempts: existing?.attempts ?? 0,
  };
}

/**
 * Restore only a durable phase boundary. The first unfinished phase and every
 * later phase are transient: they restart at activity zero with no partial
 * answers/events or attempt counters. Completed phase data remains intact.
 */
export function restartIncompleteLessonPhase(session: LessonSession): LessonSession {
  if (canonicalCompletionState(session) === "completed") {
    return { ...session, completionState: "completed", completed: true };
  }

  const completedPhaseIds = contiguousCompletedPhases(session.completedPhaseIds);
  const firstIncompleteIndex = LESSON_PHASE_ORDER.findIndex(
    (phaseId) => !completedPhaseIds.includes(phaseId),
  );

  if (firstIncompleteIndex === -1) {
    return {
      ...session,
      currentPhaseIndex: LESSON_PHASE_ORDER.length - 1,
      activityIndex: 0,
      completedPhaseIds,
      activities: Object.fromEntries(
        LESSON_PHASE_ORDER.map((phaseId) => [phaseId, activity(session, phaseId, true)]),
      ),
      completionResult: null,
      completionState: "completion_pending",
      completed: false,
    };
  }

  const resetFrom = firstIncompleteIndex;
  const activities = Object.fromEntries(
    LESSON_PHASE_ORDER.map((phaseId, index) => [
      phaseId,
      activity(session, phaseId, index < resetFrom),
    ]),
  );

  return {
    ...session,
    currentPhaseIndex: firstIncompleteIndex,
    activityIndex: 0,
    completedPhaseIds,
    activities,
    storyInteractions: resetFrom <= 0 ? [] : session.storyInteractions,
    storyComplete: resetFrom <= 0 ? false : session.storyComplete,
    vocabularyAnswers: resetFrom <= 1 ? [] : session.vocabularyAnswers,
    grammarAnswers:
      resetFrom <= 2
        ? []
        : resetFrom <= 3
          ? session.grammarAnswers.filter((answer) => !answer.validationSource)
          : session.grammarAnswers,
    grammarTranslationQuestions:
      resetFrom <= 2 ? undefined : session.grammarTranslationQuestions,
    readingAnswers: resetFrom <= 4 ? [] : session.readingAnswers,
    readingEvents: resetFrom <= 4 ? [] : session.readingEvents,
    readingComplete: resetFrom <= 4 ? false : session.readingComplete,
    listeningEvents: resetFrom <= 5 ? [] : session.listeningEvents,
    listeningComplete: resetFrom <= 5 ? false : session.listeningComplete,
    speakingEvents: resetFrom <= 6 ? [] : session.speakingEvents,
    speakingComplete: resetFrom <= 6 ? false : session.speakingComplete,
    completionResult: null,
    completionState: "active",
    completed: false,
  };
}
