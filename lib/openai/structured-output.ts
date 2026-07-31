import "server-only";

import { randomUUID } from "node:crypto";
import {
  createOpenAIApiError,
  getOpenAIApiDiagnostics,
  OpenAIApiError,
} from "@/lib/openai/api-error";
import {
  buildOpenAIResponsesRequest,
  openAIResponsesUrl,
  type OpenAIReasoningEffort,
} from "@/lib/openai/api-request";
import {
  saveGenerationTrace,
  type GenerationTraceContext,
} from "@/lib/custom-lessons/generation-trace";

export type JsonSchema = Record<string, unknown>;

const PRIMARY_MODEL =
  process.env.OPENAI_LESSON_MODEL?.trim() || "gpt-5.6-luna";
const FALLBACK_MODEL =
  process.env.OPENAI_LESSON_FALLBACK_MODEL?.trim() || PRIMARY_MODEL;
const DEFAULT_API_BASE = "https://api.openai.com/v1";
const REASONING_EFFORTS = new Set<OpenAIReasoningEffort>([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

interface OpenAIUsage {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

interface HttpResult {
  response: Response;
  payload: unknown;
  requestId: string;
}

interface ModelCallResult {
  value: unknown;
  rawOutput: string;
  model: string;
  usage: OpenAIUsage;
}

export interface StructuredGeneration<T> {
  value: T;
  model: string;
  repaired: boolean;
  issues: string[];
  durationMs: number;
  attempts: number;
}

export interface StructuredGenerationInput {
  name: string;
  prompt: string;
  schema: JsonSchema;
  validate: (value: unknown) => string[];
  model?: string;
  trace?: GenerationTraceContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function responseOutputText(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;

  for (const output of payload.output) {
    if (!isRecord(output) || output.type !== "message") continue;
    if (!Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  return null;
}

function responseRefusal(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  for (const output of payload.output) {
    if (!isRecord(output) || !Array.isArray(output.content)) continue;
    for (const content of output.content) {
      if (
        isRecord(content) &&
        content.type === "refusal" &&
        typeof content.refusal === "string"
      ) {
        return content.refusal;
      }
    }
  }
  return null;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function responseUsage(payload: unknown): OpenAIUsage {
  if (!isRecord(payload) || !isRecord(payload.usage)) return {};
  const details = isRecord(payload.usage.input_tokens_details)
    ? payload.usage.input_tokens_details
    : {};
  return {
    inputTokens: numberValue(payload.usage.input_tokens),
    cachedInputTokens: numberValue(details.cached_tokens),
    outputTokens: numberValue(payload.usage.output_tokens),
    totalTokens: numberValue(payload.usage.total_tokens),
  };
}

function parseStructuredText(model: string, value: string): unknown {
  const trimmed = value.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // Fall through to the actionable error below.
      }
    }
    throw new Error(`${model} returned malformed JSON.`);
  }
}

function requestTimeoutMs(): number {
  const configured = Number(process.env.OPENAI_REQUEST_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 120_000;
  return Math.max(10_000, Math.min(Math.round(configured), 240_000));
}

async function post(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  const requestId = randomUUID();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Client-Request-Id": requestId,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(requestTimeoutMs()),
  });
  return {
    response,
    payload: await response.json().catch(() => null),
    requestId,
  };
}

function reportRejection(model: string, result: HttpResult): void {
  const diagnostics = getOpenAIApiDiagnostics(result.payload);
  console.error("OpenAI structured request rejected.", {
    model,
    status: result.response.status,
    requestId: result.response.headers.get("x-request-id") ?? result.requestId,
    messages: diagnostics.messages.slice(0, 3),
    types: diagnostics.types.slice(0, 3),
    codes: diagnostics.codes.slice(0, 3),
    params: diagnostics.params.slice(0, 3),
  });
}

async function callModel(
  model: string,
  name: string,
  prompt: string,
  schema: JsonSchema,
  reasoningEffort: OpenAIReasoningEffort,
): Promise<{ value: unknown; rawOutput: string; usage: OpenAIUsage }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const explicitUrl = process.env.OPENAI_RESPONSES_URL?.trim();
  const url = explicitUrl || openAIResponsesUrl(
    process.env.OPENAI_API_BASE?.trim() || DEFAULT_API_BASE,
  );
  const result = await post(
    url,
    apiKey,
    buildOpenAIResponsesRequest({
      model,
      prompt,
      schema,
      schemaName: name,
      reasoningEffort,
    }),
  );
  if (!result.response.ok) {
    reportRejection(model, result);
    throw createOpenAIApiError(model, result.response.status, result.payload);
  }

  const refusal = responseRefusal(result.payload);
  if (refusal) {
    throw new Error(`${model} refused the structured request: ${refusal}`);
  }
  const output = responseOutputText(result.payload);
  if (!output) {
    const status = isRecord(result.payload) && typeof result.payload.status === "string"
      ? ` (${result.payload.status})`
      : "";
    throw new Error(`${model} did not return structured output${status}.`);
  }
  return {
    value: parseStructuredText(model, output),
    rawOutput: output,
    usage: responseUsage(result.payload),
  };
}

function configuredModel(name: string, explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (name.includes("story-only")) {
    return process.env.OPENAI_STORY_MODEL?.trim() || PRIMARY_MODEL;
  }
  if (name.includes("enrichment")) {
    return process.env.OPENAI_ENRICHMENT_MODEL?.trim() || PRIMARY_MODEL;
  }
  if (name.includes("approval") || name.includes("item repair")) {
    return process.env.OPENAI_VALIDATOR_MODEL?.trim() || PRIMARY_MODEL;
  }
  return PRIMARY_MODEL;
}

function reasoningEffort(
  value: string | undefined,
  fallback: OpenAIReasoningEffort,
): OpenAIReasoningEffort {
  const normalized = value?.trim().toLowerCase() as OpenAIReasoningEffort;
  return REASONING_EFFORTS.has(normalized) ? normalized : fallback;
}

function configuredReasoningEffort(name: string): OpenAIReasoningEffort {
  const general = process.env.OPENAI_LESSON_REASONING_EFFORT;
  if (name.includes("story-only")) {
    return reasoningEffort(
      process.env.OPENAI_STORY_REASONING_EFFORT ?? general,
      "low",
    );
  }
  if (name.includes("enrichment")) {
    return reasoningEffort(
      process.env.OPENAI_ENRICHMENT_REASONING_EFFORT ?? general,
      "medium",
    );
  }
  if (name.includes("approval") || name.includes("item repair")) {
    return reasoningEffort(
      process.env.OPENAI_VALIDATOR_REASONING_EFFORT ?? general,
      "medium",
    );
  }
  return reasoningEffort(general, "low");
}

async function call(
  name: string,
  prompt: string,
  schema: JsonSchema,
  preferredModel: string,
  effort: OpenAIReasoningEffort,
): Promise<ModelCallResult> {
  try {
    const result = await callModel(
      preferredModel,
      name,
      prompt,
      schema,
      effort,
    );
    return { ...result, model: preferredModel };
  } catch (primaryError) {
    if (primaryError instanceof OpenAIApiError && !primaryError.allowFallback) {
      throw primaryError;
    }
    if (preferredModel === FALLBACK_MODEL) throw primaryError;
    const result = await callModel(
      FALLBACK_MODEL,
      name,
      prompt,
      schema,
      effort,
    );
    return { ...result, model: FALLBACK_MODEL };
  }
}

function logCompleted(input: {
  name: string;
  result: ModelCallResult;
  repaired: boolean;
  attempts: number;
  durationMs: number;
  initialIssueCount?: number;
}): void {
  console.info("OpenAI structured generation completed.", {
    name: input.name,
    model: input.result.model,
    repaired: input.repaired,
    attempts: input.attempts,
    durationMs: input.durationMs,
    reasoningEffort: configuredReasoningEffort(input.name),
    inputTokens: input.result.usage.inputTokens,
    cachedInputTokens: input.result.usage.cachedInputTokens,
    outputTokens: input.result.usage.outputTokens,
    totalTokens: input.result.usage.totalTokens,
    ...(input.initialIssueCount === undefined
      ? {}
      : { initialIssueCount: input.initialIssueCount }),
  });
}

async function traceFailure(input: {
  trace?: GenerationTraceContext;
  name: string;
  attempt: number;
  model: string;
  prompt: string;
  error: unknown;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await saveGenerationTrace({
    trace: input.trace,
    name: input.name,
    eventType: "generation_failed",
    attempt: input.attempt,
    model: input.model,
    prompt: input.prompt,
    issues: [input.error instanceof Error ? input.error.message : String(input.error)],
    metadata: input.metadata,
  });
}

export async function generateStructured<T>(
  input: StructuredGenerationInput,
): Promise<StructuredGeneration<T>> {
  const startedAt = Date.now();
  const preferredModel = configuredModel(input.name, input.model);
  const effort = configuredReasoningEffort(input.name);
  let first: ModelCallResult;
  try {
    first = await call(
      input.name,
      input.prompt,
      input.schema,
      preferredModel,
      effort,
    );
  } catch (error) {
    await traceFailure({
      trace: input.trace,
      name: input.name,
      attempt: 1,
      model: preferredModel,
      prompt: input.prompt,
      error,
      metadata: { reasoningEffort: effort },
    });
    throw error;
  }

  const issues = input.validate(first.value);
  await saveGenerationTrace({
    trace: input.trace,
    name: input.name,
    eventType: "initial_response",
    attempt: 1,
    model: first.model,
    prompt: input.prompt,
    rawResponse: first.rawOutput,
    response: first.value,
    issues,
    metadata: {
      reasoningEffort: effort,
      durationMs: Date.now() - startedAt,
      usage: first.usage,
    },
  });

  if (issues.length === 0) {
    const durationMs = Date.now() - startedAt;
    logCompleted({
      name: input.name,
      result: first,
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

  let repaired: ModelCallResult;
  try {
    repaired = await call(
      input.name,
      repairPrompt,
      input.schema,
      first.model,
      effort,
    );
  } catch (error) {
    await traceFailure({
      trace: input.trace,
      name: input.name,
      attempt: 2,
      model: first.model,
      prompt: repairPrompt,
      error,
      metadata: {
        reasoningEffort: effort,
        initialIssues: issues,
        previousResponse: first.value,
      },
    });
    throw error;
  }

  const repairedIssues = input.validate(repaired.value);
  await saveGenerationTrace({
    trace: input.trace,
    name: input.name,
    eventType: "repair_response",
    attempt: 2,
    model: repaired.model,
    prompt: repairPrompt,
    rawResponse: repaired.rawOutput,
    response: repaired.value,
    issues: repairedIssues,
    metadata: {
      reasoningEffort: effort,
      durationMs: Date.now() - startedAt,
      usage: repaired.usage,
      initialIssues: issues,
      previousResponse: first.value,
    },
  });

  if (repairedIssues.length > 0) {
    throw new Error(
      `${input.name} validation failed: ${repairedIssues.join(" ")}`,
    );
  }
  const durationMs = Date.now() - startedAt;
  logCompleted({
    name: input.name,
    result: repaired,
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
