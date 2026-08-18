import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commuteLesson } from "@/data/mock-lessons";
import { phaseIsComplete } from "@/lib/lesson-phase-progress";
import { createEmptyLessonSession } from "@/store/app-store";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("adaptive grammar translation practice", () => {
  it("creates English prompts only when the target grammar fits naturally", () => {
    const contract = source("lib/gemini/translation-question-contract.ts");

    expect(contract).toContain("Create exactly five English-to-Japanese translation questions");
    expect(contract).toContain("The first three targets are the lesson's current grammar targets");
    expect(contract).toContain("final two normally reinforce previously practised grammar");
    expect(contract).toContain("genuinely natural translation choice");
    expect(contract).toContain("Never force a pattern");
    expect(contract).toContain("Do not put Japanese, a grammar hint, the target pattern, or the target meaning inside the English question");
  });

  it("uses the 60-to-80 band first and never falls back to unseen grammar", () => {
    const practice = source("lib/lesson/translation-practice.ts");

    expect(practice).toContain("const REINFORCEMENT_MIN = 60");
    expect(practice).toContain("const LEARNED_THRESHOLD = 80");
    expect(practice).toContain("score >= REINFORCEMENT_MIN && score < LEARNED_THRESHOLD");
    expect(practice).toContain("evidenceCount > 0");
    expect(practice).toContain('role: "lesson_fallback"');
    expect(practice).toContain("Do not silently test unseen grammar");
    expect(practice).not.toContain("unseen eligible grammar");
  });

  it("keeps targets and model answers on the server", () => {
    const practice = source("lib/lesson/translation-practice.ts");
    const publicTypes = source("types/lesson-session.ts");
    const validator = source("app/api/lesson/translation/validate/route.ts");
    const migration = source(
      "supabase/migrations/20260817160000_server_owned_translation_questions.sql",
    );

    expect(publicTypes).toContain("id: string;\n  english: string;");
    expect(publicTypes).not.toContain("targetPattern:");
    expect(publicTypes).not.toContain("targetMeaning:");
    expect(publicTypes).not.toContain("targetItemId:");
    expect(practice).toContain('.from("lesson_translation_questions")');
    expect(practice).toContain("model_answer");
    expect(validator).toContain("questionId");
    expect(validator).not.toContain('field(body, "targetPattern"');
    expect(validator).not.toContain('field(body, "targetMeaning"');
    expect(validator).not.toContain('field(body, "targetItemId"');
    expect(migration).toContain("revoke all on table public.lesson_translation_questions from anon, authenticated");
    expect(migration).toContain("grant all on table public.lesson_translation_questions to service_role");
  });

  it("uses AI semantic validation instead of exact-string grading", () => {
    const contract = source("lib/gemini/translation-question-contract.ts");
    const grammarUi = source("components/lesson/grammar-phase.tsx");
    const validator = source("app/api/lesson/translation/validate/route.ts");

    expect(contract).toContain("Judge meaning and natural Japanese, not exact string matching");
    expect(contract).toContain("Accept normal Japanese variation");
    expect(contract).toContain("hidden reference answer is an example");
    expect(grammarUi).toContain('fetch("/api/lesson/translation/validate"');
    expect(grammarUi).toContain("Check with AIko");
    expect(grammarUi).toContain("One natural answer");
    expect(grammarUi).not.toContain("Target pattern");
    expect(grammarUi).not.toContain("targetMeaning");
    expect(validator).toContain("evaluateGrammarTranslation");
  });

  it("keeps Grammar incomplete until all five translations are answered", () => {
    const session = createEmptyLessonSession(commuteLesson.id);
    session.grammarAnswers = commuteLesson.grammarQuestions.map((question) => ({
      questionId: question.id,
      type: question.type,
      selectedAnswer: question.correctAnswer,
      correct: true,
      skill: question.skill,
      attempts: 1,
    }));

    expect(phaseIsComplete(session, "grammar", commuteLesson)).toBe(false);

    session.grammarTranslationQuestions = Array.from({ length: 5 }, (_, index) => ({
      id: `translation:${index}:grammar-${index}`,
      english: `English sentence ${index + 1}`,
    }));
    session.grammarAnswers.push(
      ...session.grammarTranslationQuestions.map((question) => ({
        questionId: question.id,
        type: "natural-sentence" as const,
        selectedAnswer: "日本語の答えです。",
        correct: true,
        skill: "production" as const,
        attempts: 1,
        feedback: "Correct and natural.",
        suggestion: "Another natural wording is possible.",
        suggestedAnswer: "日本語の答えです。",
      })),
    );

    expect(phaseIsComplete(session, "grammar", commuteLesson)).toBe(true);
  });
});
