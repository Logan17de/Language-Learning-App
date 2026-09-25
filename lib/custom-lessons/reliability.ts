export type CustomLessonStage =
  | "queued"
  | "story_building"
  | "vocabulary_enrichment"
  | "library_resolution"
  | "activity_groups"
  | "final_validation"
  | "lesson_saving"
  | "audio"
  | "completed"
  | "retryable_failure"
  | "permanent_failure";

export type FailureClassification =
  | "transient"
  | "content"
  | "authorization"
  | "configuration"
  | "missing_catalog";

export interface ClassifiedFailure {
  classification: FailureClassification;
  retryable: boolean;
  message: string;
  providerRequestId: string | null;
}

export interface TeachingKanjiRecord {
  character?: unknown;
  meanings?: unknown;
  readings?: unknown;
  example_words?: unknown;
  exampleWords?: unknown;
}

export interface TeachingGrammarRecord {
  pattern?: unknown;
  meaning?: unknown;
  formation?: unknown;
  usage_notes?: unknown;
  usageNotes?: unknown;
  example_sentences?: unknown;
  examples?: unknown;
}

export type FinalizationFailureAction =
  | { kind: "retry_same_package" }
  | { kind: "invalidate_group"; group: string }
  | { kind: "fail_permanently" };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  const value = record(error);
  return typeof value?.message === "string" ? value.message : String(error || "Unknown error.");
}

function providerRequestId(error: unknown): string | null {
  const value = record(error);
  for (const key of ["providerRequestId", "requestId", "request_id"] as const) {
    if (typeof value?.[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }
  return null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyStrings(value: unknown, minimum = 1): value is string[] {
  return Array.isArray(value) && value.length >= minimum && value.every(hasText);
}

export function incompleteKanjiTeachingRecord(value: TeachingKanjiRecord): boolean {
  return !hasText(value.character) ||
    !nonEmptyStrings(value.meanings) ||
    !nonEmptyStrings(value.readings) ||
    !nonEmptyStrings(value.example_words ?? value.exampleWords);
}

export function incompleteGrammarTeachingRecord(value: TeachingGrammarRecord): boolean {
  return !hasText(value.pattern) ||
    !hasText(value.meaning) ||
    !hasText(value.formation) ||
    !hasText(value.usage_notes ?? value.usageNotes) ||
    !nonEmptyStrings(value.example_sentences ?? value.examples);
}

export function classifyGenerationError(error: unknown): ClassifiedFailure {
  const message = messageFrom(error);
  const normalized = message.toLocaleLowerCase();
  const value = record(error);
  const code = typeof value?.code === "string" ? value.code.toUpperCase() : "";

  if (code === "NONRETRYABLE_CONTENT") {
    return { classification: "content", retryable: false, message, providerRequestId: providerRequestId(error) };
  }

  if (
    normalized.includes("authentication failed") ||
    normalized.includes("unauthorized") ||
    normalized.includes("service role required") ||
    code === "42501"
  ) {
    return { classification: "authorization", retryable: false, message, providerRequestId: providerRequestId(error) };
  }
  if (
    normalized.includes("not configured") ||
    normalized.includes("api key") ||
    normalized.includes("billing") ||
    normalized.includes("rejected the structured request") ||
    normalized.includes("permission")
  ) {
    return { classification: "configuration", retryable: false, message, providerRequestId: providerRequestId(error) };
  }
  if (
    normalized.startsWith("import the ") ||
    normalized.includes("catalog does not contain enough") ||
    normalized.includes("missing catalog")
  ) {
    return { classification: "missing_catalog", retryable: false, message, providerRequestId: providerRequestId(error) };
  }
  if (
    normalized.includes("validation failed") ||
    normalized.includes("mapping failed") ||
    normalized.includes("invalid playable lesson package") ||
    normalized.includes("must contain") ||
    normalized.includes("must not be empty") ||
    normalized.includes("does not reference a valid library") ||
    ["22023", "22P02", "23502", "23503", "23514"].includes(code)
  ) {
    return { classification: "content", retryable: true, message, providerRequestId: providerRequestId(error) };
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("temporarily") ||
    normalized.includes("rate limit") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network") ||
    normalized.includes("connection") ||
    /status 5\d\d/u.test(normalized) ||
    ["40001", "40P01", "53300", "57P01", "57014"].includes(code)
  ) {
    return { classification: "transient", retryable: true, message, providerRequestId: providerRequestId(error) };
  }
  return { classification: "transient", retryable: true, message, providerRequestId: providerRequestId(error) };
}

export function retryBackoffMs(attempt: number, jitter = 0): number {
  const boundedAttempt = Math.max(1, Math.min(8, Math.round(attempt)));
  const boundedJitter = Math.max(0, Math.min(1, jitter));
  return Math.min(120_000, 2_000 * 2 ** (boundedAttempt - 1) + Math.floor(1_000 * boundedJitter));
}

export function staleWorkerClaim(
  claimedAt: string | null | undefined,
  nowMs: number,
  staleAfterMs = 8 * 60_000,
): boolean {
  if (!claimedAt) return false;
  const claimedMs = Date.parse(claimedAt);
  return Number.isFinite(claimedMs) && claimedMs <= nowMs - staleAfterMs;
}

export function finalizationFailureAction(error: unknown): FinalizationFailureAction {
  const failure = classifyGenerationError(error);
  if (failure.classification === "transient") return { kind: "retry_same_package" };
  if (!failure.retryable) return { kind: "fail_permanently" };

  const message = failure.message.toLocaleLowerCase();
  if (message.includes("reviewquestion") || message.includes("final review")) {
    return { kind: "invalidate_group", group: "final_review" };
  }
  if (message.includes("listening") || message.includes("speaking") || message.includes("communication")) {
    return { kind: "invalidate_group", group: "listening_and_speaking" };
  }
  if (message.includes("grammarquestion") || message.includes("readingconversation") || message.includes("reading question")) {
    return { kind: "invalidate_group", group: "grammar_and_reading" };
  }
  if (message.includes("vocabularyquestion") || message.includes("vocabulary question")) {
    return { kind: "invalidate_group", group: "vocabulary_and_kanji" };
  }
  return { kind: "fail_permanently" };
}
