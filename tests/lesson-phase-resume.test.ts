import { describe, expect, it } from "vitest";
import {
  LESSON_PHASE_ORDER,
  restartIncompleteLessonPhase,
} from "@/lib/lesson-resume";
import { createEmptyLessonSession } from "@/store/app-store";
import type { LessonPhaseId, LessonSession } from "@/types/lesson-session";

function partialSession(phase: LessonPhaseId): LessonSession {
  const index = LESSON_PHASE_ORDER.indexOf(phase);
  const session = createEmptyLessonSession("lesson-1");
  return {
    ...session,
    currentPhaseIndex: index,
    activityIndex: 3,
    completedPhaseIds: LESSON_PHASE_ORDER.slice(0, index),
    activities: Object.fromEntries(
      LESSON_PHASE_ORDER.map((phaseId, phaseIndex) => [
        phaseId,
        {
          phaseId,
          activityIndex: phaseIndex === index ? 3 : 0,
          completed: phaseIndex < index,
          attempts: phaseIndex === index ? 4 : 1,
        },
      ]),
    ),
    storyInteractions: [{ id: "story-event", lineId: "line-1", type: "meaning-revealed" }],
    storyComplete: index > 0,
    vocabularyAnswers: [
      {
        questionId: "vocab-1",
        mode: "reading-meaning",
        selectedAnswer: "partial",
        correct: true,
        attempts: 1,
      },
    ],
    grammarAnswers: [
      {
        questionId: "grammar-1",
        type: "multiple-choice",
        selectedAnswer: "partial",
        correct: true,
        skill: "understanding",
        attempts: 1,
      },
    ],
    readingAnswers: [{ questionId: "reading-1", response: "partial" }],
    readingEvents: [
      {
        id: "reading-event",
        type: "started",
        term: "x",
        confidence: "medium",
        elapsedSeconds: 1,
      },
    ],
    readingComplete: index > 3,
    listeningEvents: [
      {
        id: "listening-event",
        type: "answer",
        replayCount: 0,
        selectedAnswer: "partial",
        elapsedSeconds: 1,
      },
    ],
    listeningComplete: index > 4,
    speakingEvents: [
      {
        id: "speaking-event",
        mode: "medium",
        attempt: 1,
        pronunciationConfidence: 80,
        grammarAccuracy: 80,
        recognizedWords: [],
        missedWords: [],
        successfulRetry: false,
      },
    ],
    speakingComplete: false,
    completionResult: null,
    completionState: "active",
    completed: false,
  };
}

describe("phase-atomic lesson resume", () => {
  for (const phase of LESSON_PHASE_ORDER) {
    it(`restarts an incomplete ${phase} phase from activity zero`, () => {
      const original = partialSession(phase);
      const restored = restartIncompleteLessonPhase(original);
      const index = LESSON_PHASE_ORDER.indexOf(phase);

      expect(restored.currentPhaseIndex).toBe(index);
      expect(restored.activityIndex).toBe(0);
      expect(restored.completedPhaseIds).toEqual(LESSON_PHASE_ORDER.slice(0, index));
      expect(restored.activities[phase]).toEqual({
        phaseId: phase,
        activityIndex: 0,
        completed: false,
        attempts: 0,
      });
      expect(restored.completed).toBe(false);
      expect(restored.completionState).toBe("active");
    });
  }

  it("clears Story transient interactions when Story is incomplete", () => {
    const restored = restartIncompleteLessonPhase(partialSession("story"));
    expect(restored.storyInteractions).toEqual([]);
    expect(restored.storyComplete).toBe(false);
  });

  it("clears partial Vocabulary answers while preserving completed Story", () => {
    const original = partialSession("vocabulary");
    const restored = restartIncompleteLessonPhase(original);
    expect(restored.storyInteractions).toEqual(original.storyInteractions);
    expect(restored.storyComplete).toBe(true);
    expect(restored.vocabularyAnswers).toEqual([]);
  });

  it("clears partial Grammar attempts", () => {
    const restored = restartIncompleteLessonPhase(partialSession("grammar"));
    expect(restored.grammarAnswers).toEqual([]);
  });

  it("clears partial Reading answers and events", () => {
    const restored = restartIncompleteLessonPhase(partialSession("reading"));
    expect(restored.readingAnswers).toEqual([]);
    expect(restored.readingEvents).toEqual([]);
    expect(restored.readingComplete).toBe(false);
  });

  it("clears partial Premium Listening attempts", () => {
    const restored = restartIncompleteLessonPhase(partialSession("listening"));
    expect(restored.listeningEvents).toEqual([]);
    expect(restored.listeningComplete).toBe(false);
  });

  it("clears partial Premium Speaking attempts", () => {
    const restored = restartIncompleteLessonPhase(partialSession("speaking"));
    expect(restored.speakingEvents).toEqual([]);
    expect(restored.speakingComplete).toBe(false);
  });

  it("preserves all committed phases and enters completion_pending without an optimistic result", () => {
    const original = {
      ...partialSession("speaking"),
      completedPhaseIds: [...LESSON_PHASE_ORDER],
      completionResult: null,
      completed: false,
    };
    const restored = restartIncompleteLessonPhase(original);
    expect(restored.completedPhaseIds).toEqual(LESSON_PHASE_ORDER);
    // Six sections now, so the last index is 5.
    expect(restored.currentPhaseIndex).toBe(LESSON_PHASE_ORDER.length - 1);
    expect(restored.activityIndex).toBe(0);
    expect(restored.completionState).toBe("completion_pending");
    expect(restored.completionResult).toBeNull();
    expect(restored.completed).toBe(false);
  });

  it("does not downgrade an already canonical completed session", () => {
    const original = {
      ...partialSession("speaking"),
      completedPhaseIds: [...LESSON_PHASE_ORDER],
      completionResult: {
        lessonId: "lesson-1",
        score: 88,
        xpGained: 138,
        durationMinutes: 22,
        weakItems: [],
        completedAt: new Date().toISOString(),
      },
      completionState: "completed" as const,
      completed: true,
      rewarded: true,
    };
    const restored = restartIncompleteLessonPhase(original);
    expect(restored.completed).toBe(true);
    expect(restored.completionState).toBe("completed");
    expect(restored.completionResult?.score).toBe(88);
    expect(restored.rewarded).toBe(true);
  });
});
