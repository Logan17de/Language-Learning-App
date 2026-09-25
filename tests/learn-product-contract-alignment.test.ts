import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import {
  grammarStandardIsComplete,
  phaseIsComplete,
} from "@/lib/lesson-phase-progress";

function lesson(options: { premium?: boolean } = {}): LessonPackage {
  const question = (prefix: string, index: number) => ({ id: `${prefix}-${index}` });
  return {
    premiumPhaseAccess: options.premium ? "full" : "locked",
    vocabularyQuestions: Array.from({ length: 13 }, (_, index) =>
      question("v", index + 1),
    ),
    grammarQuestions: Array.from({ length: 13 }, (_, index) =>
      question("g", index + 1),
    ),
    readingQuestions: Array.from({ length: 5 }, (_, index) =>
      question("r", index + 1),
    ),
    listeningExercises: Array.from({ length: 5 }, (_, index) =>
      question("l", index + 1),
    ),
    speakingExercises: Array.from({ length: 5 }, (_, index) =>
      question("s", index + 1),
    ),
  } as unknown as LessonPackage;
}

function session(overrides: Partial<LessonSession> = {}): LessonSession {
  return {
    storyComplete: true,
    vocabularyAnswers: [],
    grammarAnswers: [],
    readingAnswers: [],
    listeningEvents: [],
    listeningComplete: false,
    speakingEvents: [],
    speakingComplete: false,
    ...overrides,
  } as unknown as LessonSession;
}

function vocabularyAnswers(count: number): LessonSession["vocabularyAnswers"] {
  return Array.from({ length: count }, (_, index) => ({
    questionId: `v-${index + 1}`,
  })) as unknown as LessonSession["vocabularyAnswers"];
}

function grammarAnswers(prefix: string, count: number): LessonSession["grammarAnswers"] {
  return Array.from({ length: count }, (_, index) => ({
    questionId: `${prefix}-${index + 1}`,
  })) as unknown as LessonSession["grammarAnswers"];
}


describe("/learn product contract", () => {
  it("treats only seven historical Vocabulary activities as playable", () => {
    const currentLesson = lesson();
    const currentSession = session({ vocabularyAnswers: vocabularyAnswers(7) });

    expect(currentLesson.vocabularyQuestions).toHaveLength(13);
    expect(phaseIsComplete(currentSession, "vocabulary", currentLesson)).toBe(true);
  });

  it("completes Grammar after its seven answers, with nothing else to satisfy", () => {
    const currentLesson = lesson();
    const standardAnswers = grammarAnswers("g", 7);
    const currentSession = session({ grammarAnswers: standardAnswers });

    expect(grammarStandardIsComplete(currentSession, currentLesson)).toBe(true);
    expect(phaseIsComplete(currentSession, "grammar", currentLesson)).toBe(true);

    // Six answers is not seven.
    expect(
      phaseIsComplete(
        session({ grammarAnswers: grammarAnswers("g", 6) }),
        "grammar",
        currentLesson,
      ),
    ).toBe(false);
  });

  it("maps no historical 10/13 practice rows into the playable learner package", () => {
    const mapper = readFileSync("lib/repositories/lesson-mapper-v3.ts", "utf8");
    expect(mapper).toContain("vocabulary: 7");
    expect(mapper).toContain("grammar: 7");
    expect(mapper).toContain("reading: 5");
    expect(mapper).toContain("listening: 5");
    expect(mapper).toContain("speaking: 5");
    expect(mapper).toContain("lesson.vocabularyQuestions.slice");
    expect(mapper).toContain("lesson.grammarQuestions.slice");
  });

  it("never uses the lesson Back control to rewind a completed phase", () => {
    const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
    const shell = readFileSync(
      "components/lesson/lesson-player-shell.tsx",
      "utf8",
    );

    expect(shell).not.toContain("onBack");
    expect(shell).not.toContain("ArrowLeft");
    expect(shell).toContain('aria-label="Exit lesson"');
    expect(player).not.toContain("currentPhaseIndex - 1");
    expect(player).not.toContain("previousPhase");
  });

  it("keeps daily allowance and Resume as separate UI actions", () => {
    const library = readFileSync("components/learn/lesson-library.tsx", "utf8");
    const activation = readFileSync(
      "supabase/migrations/20260820023100_activate_learn_product_contract.sql",
      "utf8",
    );

    expect(library).toContain("Resume lesson");
    expect(library).toContain("Start new lesson");
    expect(library).toContain("setShowCreationForm(true)");
    expect(library).toContain("creationState?.canCreate");
    expect(activation).toContain("v_daily_limit := 1");
    expect(activation).toContain("v_daily_limit := 5");
    expect(activation).toContain("assignment.status in ('assigned','started')");
  });
});
