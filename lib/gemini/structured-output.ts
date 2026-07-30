import "server-only";

import {
  createGeminiApiError,
  GeminiApiError,
  getGeminiApiDiagnostics,
} from "@/lib/gemini/api-error";
import {
  buildGenerateContentRequest,
  buildInteractionsRequest,
  generateContentUrl,
} from "@/lib/gemini/api-request";

export type JsonSchema = Record<string, unknown>;

const PRIMARY_MODEL =
  process.env.GEMINI_LESSON_MODEL?.trim() || "gemini-3-flash-preview";
const FALLBACK_MODEL =
  process.env.GEMINI_LESSON_FALLBACK_MODEL?.trim() || "gemini-3.1-flash-lite";
const GENERATE_CONTENT_BASE =
  process.env.GEMINI_GENERATE_CONTENT_BASE?.trim() ||
  "https://generativelanguage.googleapis.com/v1beta/models";
const INTERACTIONS_ENDPOINT =
  process.env.GEMINI_API_BASE?.trim() ||
  "https://generativelanguage.googleapis.com/v1beta/interactions";

interface HttpResult {
  response: Response;
  payload: unknown;
  transport: "generateContent" | "interactions";
}

export interface StructuredGeneration<T> {
  value: T;
  model: string;
  repaired: boolean;
  issues: string[];
  durationMs: number;
  attempts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function outputText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = outputText(item);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["output_text", "outputText", "text"]) {
    if (typeof value[key] === "string") return value[key];
  }
  for (const key of [
    "candidates",
    "outputs",
    "output",
    "content",
    "parts",
    "response",
    "steps",
  ]) {
    if (key in value) {
      const found = outputText(value[key]);
      if (found) return found;
    }
  }
  return null;
}

async function post(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  transport: HttpResult["transport"],
  apiRevision = false,
): Promise<HttpResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      ...(apiRevision ? { "Api-Revision": "2026-05-20" } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  return {
    response,
    payload: await response.json().catch(() => null),
    transport,
  };
}

function reportRejection(model: string, result: HttpResult): void {
  const diagnostics = getGeminiApiDiagnostics(result.payload);
  console.error("Gemini structured request rejected.", {
    model,
    transport: result.transport,
    status: result.response.status,
    messages: diagnostics.messages.slice(0, 3),
    reasons: diagnostics.reasons.slice(0, 3),
    fields: diagnostics.fields.slice(0, 5),
  });
}

async function callModel(
  model: string,
  prompt: string,
  schema: JsonSchema,
): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  let result = await post(
    generateContentUrl(GENERATE_CONTENT_BASE, model),
    apiKey,
    buildGenerateContentRequest(prompt, schema),
    "generateContent",
  );
  if ([404, 405, 501].includes(result.response.status)) {
    result = await post(
      INTERACTIONS_ENDPOINT,
      apiKey,
      buildInteractionsRequest(model, prompt, schema),
      "interactions",
      true,
    );
  }
  if (!result.response.ok) {
    reportRejection(model, result);
    throw createGeminiApiError(model, result.response.status, result.payload);
  }

  const text = outputText(result.payload);
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${model} returned malformed JSON.`);
    }
  }
  if (
    isRecord(result.payload) &&
    !("candidates" in result.payload) &&
    !("outputs" in result.payload) &&
    !("output" in result.payload)
  ) {
    return result.payload;
  }
  throw new Error(`${model} did not return structured output.`);
}

function configuredModel(name: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (name.includes("story-only")) {
    return process.env.GEMINI_STORY_MODEL?.trim() || PRIMARY_MODEL;
  }
  if (name.includes("story lexical enrichment")) {
    return process.env.GEMINI_ENRICHMENT_MODEL?.trim() || PRIMARY_MODEL;
  }
  if (name.includes("approval") || name.includes("item repair")) {
    return process.env.GEMINI_VALIDATOR_MODEL?.trim() || PRIMARY_MODEL;
  }
  return PRIMARY_MODEL;
}

async function call(
  prompt: string,
  schema: JsonSchema,
  preferredModel: string,
): Promise<{ value: unknown; model: string }> {
  try {
    return {
      value: await callModel(preferredModel, prompt, schema),
      model: preferredModel,
    };
  } catch (primaryError) {
    if (primaryError instanceof GeminiApiError && !primaryError.allowFallback) {
      throw primaryError;
    }
    if (preferredModel === FALLBACK_MODEL) throw primaryError;
    return {
      value: await callModel(FALLBACK_MODEL, prompt, schema),
      model: FALLBACK_MODEL,
    };
  }
}

export async function generateStructured<T>(input: {
  name: string;
  prompt: string;
  schema: JsonSchema;
  validate: (value: unknown) => string[];
  model?: string;
}): Promise<StructuredGeneration<T>> {
  const startedAt = Date.now();
  const preferredModel = configuredModel(input.name, input.model);
  const first = await call(input.prompt, input.schema, preferredModel);
  const issues = input.validate(first.value);
  if (issues.length === 0) {
    const durationMs = Date.now() - startedAt;
    console.info("Gemini structured generation completed.", {
      name: input.name,
      model: first.model,
      repaired: false,
      attempts: 1,
      durationMs,
    });
    return {
      value: first.value as T,
      model: first.model,
      repaired: false,
      issues: [],
      durationMs,
      attempts: 1,
    };
  }

  const repairPrompt = [
    input.prompt,
    "",
    `Correct the complete ${input.name} JSON. Return no explanation.`,
    ...issues.map((issue) => `- ${issue}`),
    "Previous JSON:",
    JSON.stringify(first.value),
  ].join("\n");
  const repaired = await call(repairPrompt, input.schema, preferredModel);
  const repairedIssues = input.validate(repaired.value);
  if (repairedIssues.length > 0) {
    throw new Error(
      `${input.name} validation failed: ${repairedIssues.join(" ")}`,
    );
  }
  const durationMs = Date.now() - startedAt;
  console.info("Gemini structured generation completed.", {
    name: input.name,
    model: repaired.model,
    repaired: true,
    attempts: 2,
    durationMs,
    initialIssueCount: issues.length,
  });
  return {
    value: repaired.value as T,
    model: repaired.model,
    repaired: true,
    issues,
    durationMs,
    attempts: 2,
  };
}
