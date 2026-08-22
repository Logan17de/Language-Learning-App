import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonPackage } from "@/types/lesson";
import type { LessonSession } from "@/types/lesson-session";
import {
  grammarStandardIsComplete,
  phaseIsComplete,
} from "@/lib/lesson-phase-progress";
import {
  LEARN_PRODUCT_CONTRACT_VERSION,
  learnProductContractIsActive,
} from "@/lib/learn-product-contract";

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
    grammarTranslationQuestions: [],
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

function translationQuestions(): NonNullable<LessonSession["grammarTranslationQuestions"]> {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `t-${index + 1}`,
  })) as unknown as NonNullable<LessonSession["grammarTranslationQuestions"]>;
}

describe("/learn product contract", () => {
  it("treats only seven historical Vocabulary activities as playable", () => {
    const currentLesson = lesson();
    const currentSession = session({ vocabularyAnswers: vocabularyAnswers(7) });

    expect(currentLesson.vocabularyQuestions).toHaveLength(13);
    expect(phaseIsComplete(currentSession, "vocabulary", currentLesson)).toBe(true);
  });

  it("completes Grammar after seven answers and gates Translation independently for Free", () => {
    const currentLesson = lesson();
    const standardAnswers = grammarAnswers("g", 7);
    const currentSession = session({ grammarAnswers: standardAnswers });

    expect(grammarStandardIsComplete(currentSession, currentLesson)).toBe(true);
    expect(phaseIsComplete(currentSession, "grammar", currentLesson, true)).toBe(true);
    expect(phaseIsComplete(currentSession, "grammar", currentLesson, false)).toBe(true);
    expect(phaseIsComplete(currentSession, "translation", currentLesson, true)).toBe(true);
    expect(phaseIsComplete(currentSession, "translation", currentLesson, false)).toBe(false);

    const translations = translationQuestions();
    const withLegacyTranslations = session({
      grammarTranslationQuestions: translations,
      grammarAnswers: [
        ...standardAnswers,
        ...grammarAnswers("t", 5),
      ],
    });

    expect(
      phaseIsComplete(withLegacyTranslations, "translation", currentLesson, false),
    ).toBe(true);
  });

  it("requires exactly five Translation answers in the Premium Translation section", () => {
    const currentLesson = lesson({ premium: true });
    const standardAnswers = grammarAnswers("g", 7);
    const translations = translationQuestions();

    expect(
      phaseIsComplete(
        session({
          grammarTranslationQuestions: translations,
          grammarAnswers: standardAnswers,
        }),
        "translation",
        currentLesson,
        true,
      ),
    ).toBe(false);

    expect(
      phaseIsComplete(
        session({
          grammarTranslationQuestions: translations,
          grammarAnswers: [
            ...standardAnswers,
            ...grammarAnswers("t", 5),
          ],
        }),
        "translation",
        currentLesson,
        true,
      ),
    ).toBe(true);
  });

  it("activates only on the exact final DB sentinel and fails closed on unknown errors", async () => {
    const client = (result: unknown) =>
      ({ rpc: async () => result }) as unknown as SupabaseClient;

    await expect(
      learnProductContractIsActive(
        client({ data: LEARN_PRODUCT_CONTRACT_VERSION, error: null }),
      ),
    ).resolves.toBe(true);
    await expect(
      learnProductContractIsActive(
        client({
          data: null,
          error: {
            code: "PGRST202",
            message: "Could not find public.learn_product_contract_version()",
          },
        }),
      ),
    ).resolves.toBe(false);
    await expect(
      learnProductContractIsActive(
        client({ data: null, error: { code: "42501", message: "denied" } }),
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps protected Translation server-owned and phase-atomic", () => {
    const questions = readFileSync(
      "app/api/lesson/translation/questions/route.ts",
      "utf8",
    );
    const validate = readFileSync(
      "app/api/lesson/translation/validate/route.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/20260820023000_learn_product_contract_alignment.sql",
      "utf8",
    );

    expect(questions).toContain("learnProductContractIsActive");
    expect(questions).toContain("hasPremiumLessonPhaseAccess");
    expect(questions).toContain("status: 403");
    expect(validate).toContain("learnProductContractIsActive");
    expect(validate).not.toContain("record_mastery_evidence");
    expect(migration).toContain("revoke select, insert, update, delete on table public.lesson_translation_questions");
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
