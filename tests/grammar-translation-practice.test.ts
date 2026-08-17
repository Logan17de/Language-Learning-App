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
    expect(contract).toContain("The final two are previously seen reinforcement patterns");
    expect(contract).toContain("genuinely natural translation choice");
    expect(contract).toContain("Never force a pattern");
    expect(contract).toContain("Do not put Japanese, a grammar hint, or the target pattern inside the English question");
  });

  it("selects reinforcement grammar from the current 60-to-80 mastery band", () => {
    const practice = source("lib/lesson/translation-practice.ts");

    expect(practice).toContain("const REINFORCEMENT_MIN = 60");
    expect(practice).toContain("const LEARNED_THRESHOLD = 80");
    expect(practice).toContain("score >= REINFORCEMENT_MIN && score < LEARNED_THRESHOLD");
    expect(practice).toContain(".slice(0, 2)");
    expect(practice).toContain("...lessonTargets");
    expect(practice).toContain('role: "reinforcement" as const');
  });

  it("uses AI semantic validation instead of exact-string grading", () => {
    const contract = source("lib/gemini/translation-question-contract.ts");
    const grammarUi = source("components/lesson/grammar-phase.tsx");
    const validator = source("app/api/lesson/translation/validate/route.ts");

    expect(contract).toContain("Judge meaning and natural Japanese, not exact string matching");
    expect(contract).toContain("Accept normal Japanese variation");
    expect(contract).toContain("feedback: briefly say why");
    expect(contract).toContain("suggestion: give one concrete improvement");
    expect(grammarUi).toContain('fetch("/api/lesson/translation/validate"');
    expect(grammarUi).toContain("Check with AIko");
    expect(grammarUi).toContain("One natural answer");
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
      targetPattern: `pattern-${index + 1}`,
      targetMeaning: `meaning-${index + 1}`,
      targetItemId: `grammar-${index}`,
      role: index < 3 ? "lesson_target" as const : "reinforcement" as const,
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
