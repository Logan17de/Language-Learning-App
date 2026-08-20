import type { TranslationEvaluation } from "@/lib/gemini/translation-question-contract";

export type TranslationValidationSource = "exact_match" | "ai";

export interface TranslationValidationResult {
  correct: boolean;
  feedback: string;
  suggestion?: string;
  revealAnswer: string;
  validationSource: TranslationValidationSource;
}

export interface PersistedTranslationAnswer {
  correct: boolean;
  answerData: unknown;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function normalizeTranslationForExactMatch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/[.,!?;:。、！？；：]/gu, "");
}

export function persistedTranslationResult(input: {
  existing?: PersistedTranslationAnswer | null;
  modelAnswer: string;
}): TranslationValidationResult | null {
  const data = record(input.existing?.answerData);
  if (!input.existing || data?.serverValidated !== true) return null;

  const correct = Boolean(input.existing.correct);
  const source: TranslationValidationSource =
    data.validationSource === "exact_match" ? "exact_match" : "ai";
  const feedback =
    text(data.feedback) ?? (correct ? "Correct." : "Check your answer.");
  const suggestion = correct ? undefined : text(data.suggestion);

  return {
    correct,
    feedback,
    ...(suggestion ? { suggestion } : {}),
    revealAnswer: input.modelAnswer,
    validationSource: source,
  };
}

export async function validateTranslationAttempt(input: {
  learnerAnswer: string;
  modelAnswer: string;
  existing?: PersistedTranslationAnswer | null;
  evaluateWithAi: () => Promise<TranslationEvaluation>;
}): Promise<TranslationValidationResult> {
  const persisted = persistedTranslationResult({
    existing: input.existing,
    modelAnswer: input.modelAnswer,
  });
  if (persisted) return persisted;

  if (
    normalizeTranslationForExactMatch(input.learnerAnswer) ===
    normalizeTranslationForExactMatch(input.modelAnswer)
  ) {
    return {
      correct: true,
      feedback: "Correct.",
      revealAnswer: input.modelAnswer,
      validationSource: "exact_match",
    };
  }

  const evaluation = await input.evaluateWithAi();
  const suggestion = evaluation.correct ? undefined : text(evaluation.suggestion);
  return {
    correct: evaluation.correct,
    feedback: evaluation.feedback.trim(),
    ...(suggestion ? { suggestion } : {}),
    revealAnswer: input.modelAnswer,
    validationSource: "ai",
  };
}

export function translationAnswerData(
  result: TranslationValidationResult,
  targetItemId: string,
): Record<string, unknown> {
  return {
    serverValidated: true,
    targetItemId,
    validationSource: result.validationSource,
    feedback: result.feedback,
    ...(result.suggestion ? { suggestion: result.suggestion } : {}),
  };
}
