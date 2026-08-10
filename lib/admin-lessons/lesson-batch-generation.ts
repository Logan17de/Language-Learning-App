import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOpenAIResponsesRequest,
  type OpenAIReasoningEffort,
} from "@/lib/openai/api-request";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  COMPLETE_LESSON_BATCH_SCHEMA,
  MAX_BATCH_LESSONS,
  TARGET_GRAMMAR_COUNT,
  TARGET_KANJI_COUNT,
  buildLessonPrompt,
  normalizeBatchLevel,
  parseGeneratedLesson,
  validateGeneratedLesson,
  type SupportedBatchLevel,
} from "@/lib/admin-lessons/lesson-generation-contract";
import {
  getGenerationBatchSummary,
  type GenerationBatchSummary,
} from "@/lib/admin-lessons/lesson-generation-staging";

export { normalizeBatchLevel } from "@/lib/admin-lessons/lesson-generation-contract";
export type { SupportedBatchLevel } from "@/lib/admin-lessons/lesson-generation-contract";

const RESERVATION_DRAW_ATTEMPTS = 20_000;
const TERMINAL_PROVIDER_STATUSES = new Set([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);
const ACTIVE_LOCAL_STATUSES = [
  "submitting",
  "validating",
  "in_progress",
  "finalizing",
] as const;

type RawClient = SupabaseClient;
type AnyRecord = Record<string, unknown>;
type PlannedRequest = {
  customId: string;
  sequence: number;
  targetKanji: string[];
  targetGrammar: string[];
};

function adminClient(): RawClient {
  return createAdminClient() as unknown as RawClient;
}

function record(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function openAIKey(): string {
  const value = process.env.OPENAI_API_KEY?.trim();
  if (!value) throw new Error("OPENAI_API_KEY is required for lesson Batch generation.");
  return value;
}

function openAIBase(): string {
  return (process.env.OPENAI_API_BASE?.trim() || "https://api.openai.com/v1").replace(/\/+$/u, "");
}

function lessonModel(): string {
  return process.env.OPENAI_LESSON_MODEL?.trim() || "gpt-5.6-luna";
}

function reasoningEffort(): OpenAIReasoningEffort {
  const configured = process.env.OPENAI_STORY_REASONING_EFFORT?.trim();
  if (
    configured === "none" ||
    configured === "low" ||
    configured === "medium" ||
    configured === "high" ||
    configured === "xhigh" ||
    configured === "max"
  ) {
    return configured;
  }
  return "low";
}

async function openAIJson(path: string, init: RequestInit): Promise<AnyRecord> {
  const controller = new AbortController();
  const timeoutMs = Math.max(
    10_000,
    Number(process.env.OPENAI_REQUEST_TIMEOUT_MS || 120_000),
  );
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${openAIBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${openAIKey()}`,
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = raw;
    }
    if (!response.ok) {
      const message = record(payload) && record(payload.error)
        ? text(payload.error.message)
        : null;
      throw new Error(message || `OpenAI request failed with HTTP ${response.status}.`);
    }
    if (!record(payload)) throw new Error("OpenAI returned an invalid JSON response.");
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function openAIFileContent(fileId: string): Promise<string> {
  const response = await fetch(`${openAIBase()}/files/${encodeURIComponent(fileId)}/content`, {
    headers: { Authorization: `Bearer ${openAIKey()}` },
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI file ${fileId} could not be downloaded: ${raw.slice(0, 300)}`);
  }
  return raw;
}

async function uploadBatchInput(
  batchId: string,
  level: SupportedBatchLevel,
  jsonl: string,
): Promise<string> {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    `aiko-${level.toLowerCase()}-lessons-${batchId}.jsonl`,
  );
  const payload = await openAIJson("/files", { method: "POST", body: form });
  const fileId = text(payload.id);
  if (!fileId) throw new Error("OpenAI did not return an input file id.");
  return fileId;
}

async function createProviderBatch(
  inputFileId: string,
  localBatchId: string,
  level: SupportedBatchLevel,
): Promise<AnyRecord> {
  return openAIJson("/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: "/v1/responses",
      completion_window: "24h",
      metadata: {
        aiko_batch_id: localBatchId,
        jlpt_level: level,
        feature: "jlpt_lesson_factory",
      },
    }),
  });
}

async function retrieveProviderBatch(providerBatchId: string): Promise<AnyRecord> {
  return openAIJson(`/batches/${encodeURIComponent(providerBatchId)}`, { method: "GET" });
}

function providerStatus(value: unknown): string {
  const status = text(value) || "failed";
  return [
    "validating",
    "in_progress",
    "finalizing",
    "completed",
    "failed",
    "expired",
    "cancelling",
    "cancelled",
  ].includes(status)
    ? status
    : "failed";
}

function randomTargetSet(keys: string[], count: number): string[] {
  const pool = [...keys];
  for (let index = 0; index < count; index += 1) {
    const swapIndex = randomInt(index, pool.length);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

function chooseBalancedGrammarSet(input: {
  keys: string[];
  count: number;
  usage: Map<string, number>;
}): string[] {
  const available = [...input.keys];
  const selected: string[] = [];
  while (selected.length < input.count) {
    const minimumUsage = Math.min(
      ...available.map((pattern) => input.usage.get(pattern) ?? 0),
    );
    const leastUsed = available.filter(
      (pattern) => (input.usage.get(pattern) ?? 0) === minimumUsage,
    );
    const chosen = leastUsed[randomInt(leastUsed.length)];
    selected.push(chosen);
    input.usage.set(chosen, (input.usage.get(chosen) ?? 0) + 1);
    available.splice(available.indexOf(chosen), 1);
  }
  return selected;
}

async function loadCatalogTargets(
  admin: RawClient,
  level: SupportedBatchLevel,
): Promise<{ kanji: string[]; grammar: string[]; grammarUsage: Map<string, number> }> {
  const [kanjiResult, grammarResult, historyResult] = await Promise.all([
    admin
      .from("kanji_catalog")
      .select("character")
      .eq("jlpt_level", level)
      .eq("active", true)
      .order("source_order"),
    admin
      .from("grammar_catalog")
      .select("pattern")
      .eq("jlpt_level", level)
      .eq("active", true)
      .order("source_order"),
    admin
      .from("lesson_generation_requests")
      .select("target_grammar")
      .eq("jlpt_level", level),
  ]);
  const error = kanjiResult.error || grammarResult.error || historyResult.error;
  if (error) throw new Error(error.message);

  const kanji = [...new Set(
    (kanjiResult.data ?? [])
      .map((row) => record(row) ? text(row.character) : null)
      .filter((value): value is string => Boolean(value) && [...value].length === 1),
  )];
  const grammar = [...new Set(
    (grammarResult.data ?? [])
      .map((row) => record(row) ? text(row.pattern) : null)
      .filter((value): value is string => Boolean(value)),
  )];

  if (kanji.length < TARGET_KANJI_COUNT) {
    throw new Error(`${level} needs at least ${TARGET_KANJI_COUNT} active kanji catalog entries.`);
  }
  if (grammar.length < TARGET_GRAMMAR_COUNT) {
    throw new Error(`${level} needs at least ${TARGET_GRAMMAR_COUNT} active grammar catalog entries.`);
  }

  const grammarUsage = new Map(grammar.map((pattern) => [pattern, 0]));
  for (const row of historyResult.data ?? []) {
    if (!record(row)) continue;
    for (const pattern of new Set(strings(row.target_grammar))) {
      if (grammarUsage.has(pattern)) {
        grammarUsage.set(pattern, (grammarUsage.get(pattern) ?? 0) + 1);
      }
    }
  }
  return { kanji, grammar, grammarUsage };
}

async function reserveUniqueKanjiSet(input: {
  admin: RawClient;
  level: SupportedBatchLevel;
  kanjiPool: string[];
  batchId: string;
  customId: string;
}): Promise<string[]> {
  for (let attempt = 0; attempt < RESERVATION_DRAW_ATTEMPTS; attempt += 1) {
    const candidate = randomTargetSet(input.kanjiPool, TARGET_KANJI_COUNT);
    const reserved = await input.admin.rpc("reserve_lesson_generation_kanji_set", {
      p_jlpt_level: input.level,
      p_target_kanji: candidate,
      p_generation_batch_id: input.batchId,
      p_custom_id: input.customId,
    });
    if (reserved.error) throw new Error(reserved.error.message);
    if (reserved.data === true) return candidate;
  }
  throw new Error(
    `${input.level} could not reserve another unique five-kanji set after ${RESERVATION_DRAW_ATTEMPTS.toLocaleString()} random draws. Refresh target capacity before retrying.`,
  );
}

async function planRequests(input: {
  admin: RawClient;
  count: number;
  level: SupportedBatchLevel;
  batchId: string;
}): Promise<PlannedRequest[]> {
  const catalog = await loadCatalogTargets(input.admin, input.level);
  const plans: PlannedRequest[] = [];
  for (let index = 0; index < input.count; index += 1) {
    const sequence = index + 1;
    const customId = `${input.level.toLowerCase()}_${input.batchId.replace(/-/gu, "").slice(0, 12)}_${String(sequence).padStart(3, "0")}`;
    const targetKanji = await reserveUniqueKanjiSet({
      admin: input.admin,
      level: input.level,
      kanjiPool: catalog.kanji,
      batchId: input.batchId,
      customId,
    });
    const targetGrammar = chooseBalancedGrammarSet({
      keys: catalog.grammar,
      count: TARGET_GRAMMAR_COUNT,
      usage: catalog.grammarUsage,
    });
    plans.push({ customId, sequence, targetKanji, targetGrammar });
  }
  return plans;
}

function buildLessonRequestBody(
  prompt: string,
  model: string,
  level: SupportedBatchLevel,
): Record<string, unknown> {
  return buildOpenAIResponsesRequest({
    model,
    prompt,
    schema: COMPLETE_LESSON_BATCH_SCHEMA,
    schemaName: `complete_${level.toLowerCase()}_lesson`,
    reasoningEffort: reasoningEffort(),
    strictSchema: true,
  });
}

function extractResponseText(body: AnyRecord): {
  output: string | null;
  error: unknown | null;
} {
  const direct = text(body.output_text);
  if (direct) return { output: direct, error: null };
  if (!Array.isArray(body.output)) return { output: null, error: body.error ?? null };
  const parts: string[] = [];
  const refusals: string[] = [];
  for (const item of body.output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!record(content)) continue;
      if (content.type === "output_text" && text(content.text)) {
        parts.push(text(content.text) as string);
      }
      if (content.type === "refusal" && text(content.refusal)) {
        refusals.push(text(content.refusal) as string);
      }
    }
  }
  return {
    output: parts.length ? parts.join("\n") : null,
    error: refusals.length
      ? { type: "refusal", messages: refusals }
      : body.error ?? null,
  };
}

function usageFromBody(body: AnyRecord): {
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
} {
  const usage = record(body.usage) ? body.usage : {};
  return {
    input_tokens: numeric(usage.input_tokens),
    output_tokens: numeric(usage.output_tokens),
    total_tokens: numeric(usage.total_tokens),
  };
}

async function appendUnmatchedLine(
  admin: RawClient,
  batchId: string,
  raw: unknown,
): Promise<void> {
  const current = await admin
    .from("lesson_generation_batches")
    .select("unmatched_provider_lines")
    .eq("id", batchId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const existing = current.data && Array.isArray(current.data.unmatched_provider_lines)
    ? current.data.unmatched_provider_lines
    : [];
  const updated = await admin
    .from("lesson_generation_batches")
    .update({
      unmatched_provider_lines: [...existing, raw] as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);
  if (updated.error) throw new Error(updated.error.message);
}

async function ingestProviderLine(
  admin: RawClient,
  batchId: string,
  line: unknown,
): Promise<void> {
  if (!record(line)) {
    await appendUnmatchedLine(admin, batchId, line);
    return;
  }
  const customId = text(line.custom_id);
  if (!customId) {
    await appendUnmatchedLine(admin, batchId, line);
    return;
  }

  const staged = await admin
    .from("lesson_generation_requests")
    .select("id,target_kanji,target_grammar,jlpt_level")
    .eq("generation_batch_id", batchId)
    .eq("custom_id", customId)
    .maybeSingle();
  if (staged.error) throw new Error(staged.error.message);
  if (!staged.data) {
    await appendUnmatchedLine(admin, batchId, line);
    return;
  }

  // Store the complete provider line before any response extraction, parsing,
  // or deterministic validation. Manual repair never mutates this field.
  const rawSaved = await admin
    .from("lesson_generation_requests")
    .update({
      raw_provider_line: line as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", staged.data.id);
  if (rawSaved.error) throw new Error(rawSaved.error.message);

  const level = normalizeBatchLevel(staged.data.jlpt_level);
  if (!level) {
    const failed = await admin
      .from("lesson_generation_requests")
      .update({
        status: "invalid",
        validation_errors: ["Staged lesson uses an unsupported JLPT level."],
        updated_at: new Date().toISOString(),
      })
      .eq("id", staged.data.id);
    if (failed.error) throw new Error(failed.error.message);
    return;
  }

  const response = record(line.response) ? line.response : null;
  const statusCode = response ? numeric(response.status_code) : null;
  const body = response && record(response.body) ? response.body : null;
  const lineError = line.error ?? response?.error ?? null;

  if (!body || !statusCode || statusCode < 200 || statusCode >= 300) {
    const failed = await admin
      .from("lesson_generation_requests")
      .update({
        status: "api_failed",
        provider_error: (lineError ?? { status_code: statusCode }) as Json,
        validation_errors: [
          "The Batch request failed before a complete lesson response was available.",
        ],
        updated_at: new Date().toISOString(),
      })
      .eq("id", staged.data.id);
    if (failed.error) throw new Error(failed.error.message);
    return;
  }

  const extracted = extractResponseText(body);
  const usage = usageFromBody(body);
  if (!extracted.output) {
    const failed = await admin
      .from("lesson_generation_requests")
      .update({
        ...usage,
        provider_request_id: text(body.id),
        status: "api_failed",
        provider_error: (
          extracted.error ?? { message: "Response contained no output_text." }
        ) as Json,
        validation_errors: ["The model returned no lesson JSON text."],
        updated_at: new Date().toISOString(),
      })
      .eq("id", staged.data.id);
    if (failed.error) throw new Error(failed.error.message);
    return;
  }

  let parsed: unknown = null;
  let errors: string[] = [];
  try {
    parsed = parseGeneratedLesson(extracted.output);
    errors = validateGeneratedLesson({
      value: parsed,
      targetKanji: strings(staged.data.target_kanji),
      targetGrammar: strings(staged.data.target_grammar),
      level,
    });
  } catch (error) {
    errors = [
      `JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error."}`,
    ];
  }

  const saved = await admin
    .from("lesson_generation_requests")
    .update({
      ...usage,
      raw_response: extracted.output,
      parsed_lesson: parsed as Json | null,
      provider_error: extracted.error as Json | null,
      provider_request_id: text(body.id),
      status: errors.length ? "invalid" : "valid",
      validation_errors: errors,
      last_validated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", staged.data.id);
  if (saved.error) throw new Error(saved.error.message);
}

async function ingestJsonlFile(
  admin: RawClient,
  batchId: string,
  content: string,
): Promise<void> {
  for (const rawLine of content.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed) as unknown;
    } catch {
      await appendUnmatchedLine(admin, batchId, { unparseable_line: trimmed });
      continue;
    }
    await ingestProviderLine(admin, batchId, value);
  }
}

export async function submitLessonBatch(input: {
  count: number;
  userId: string;
  level: SupportedBatchLevel;
}): Promise<{
  batchId: string;
  providerBatchId: string;
  requestedCount: number;
  level: SupportedBatchLevel;
}> {
  const count = Math.round(input.count);
  const level = normalizeBatchLevel(input.level);
  if (!level) throw new Error("Batch lesson generation supports N5, N4, N3, N2, and N1.");
  if (count < 1 || count > MAX_BATCH_LESSONS) {
    throw new Error(`Batch generation accepts 1-${MAX_BATCH_LESSONS} lessons at a time.`);
  }

  const admin = adminClient();
  const model = lessonModel();
  const created = await admin
    .from("lesson_generation_batches")
    .insert({
      jlpt_level: level,
      requested_count: count,
      model,
      status: "planning",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (created.error || !created.data) {
    throw new Error(created.error?.message || "Generation batch could not be created.");
  }
  const batchId = String(created.data.id);

  try {
    const plans = await planRequests({ admin, count, level, batchId });
    const rows = plans.map((plan) => {
      const prompt = buildLessonPrompt({
        customId: plan.customId,
        level,
        targetKanji: plan.targetKanji,
        targetGrammar: plan.targetGrammar,
      });
      const requestBody = buildLessonRequestBody(prompt, model, level);
      return {
        generation_batch_id: batchId,
        custom_id: plan.customId,
        sequence_number: plan.sequence,
        jlpt_level: level,
        target_kanji: plan.targetKanji,
        target_grammar: plan.targetGrammar,
        prompt,
        request_body: requestBody as unknown as Json,
        model,
        status: "planned",
      };
    });

    const inserted = await admin.from("lesson_generation_requests").insert(rows);
    if (inserted.error) throw new Error(inserted.error.message);

    const submitting = await admin
      .from("lesson_generation_batches")
      .update({ status: "submitting", updated_at: new Date().toISOString() })
      .eq("id", batchId);
    if (submitting.error) throw new Error(submitting.error.message);

    const jsonl = rows
      .map((row) => JSON.stringify({
        custom_id: row.custom_id,
        method: "POST",
        url: "/v1/responses",
        body: row.request_body,
      }))
      .join("\n");

    const inputFileId = await uploadBatchInput(batchId, level, jsonl);
    const provider = await createProviderBatch(inputFileId, batchId, level);
    const providerBatchId = text(provider.id);
    if (!providerBatchId) throw new Error("OpenAI did not return a Batch id.");

    const now = new Date().toISOString();
    const [batchSaved, requestsSaved] = await Promise.all([
      admin
        .from("lesson_generation_batches")
        .update({
          status: providerStatus(provider.status),
          provider_batch_id: providerBatchId,
          provider_input_file_id: inputFileId,
          provider_batch_object: provider as unknown as Json,
          provider_request_counts: (provider.request_counts ?? {}) as Json,
          submitted_at: now,
          last_synced_at: now,
          updated_at: now,
        })
        .eq("id", batchId),
      admin
        .from("lesson_generation_requests")
        .update({ status: "submitted", updated_at: now })
        .eq("generation_batch_id", batchId),
    ]);
    if (batchSaved.error || requestsSaved.error) {
      throw new Error(
        batchSaved.error?.message ||
          requestsSaved.error?.message ||
          "Batch state could not be saved.",
      );
    }

    return { batchId, providerBatchId, requestedCount: count, level };
  } catch (error) {
    await admin
      .from("lesson_generation_batches")
      .update({
        status: "failed",
        error_message: error instanceof Error
          ? error.message.slice(0, 2_000)
          : "Batch submission failed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    throw error;
  }
}

export async function syncGenerationBatch(
  batchId: string,
): Promise<GenerationBatchSummary> {
  const admin = adminClient();
  const local = await admin
    .from("lesson_generation_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (local.error) throw new Error(local.error.message);
  if (!local.data) throw new Error("Generation batch not found.");
  const providerBatchId = text(local.data.provider_batch_id);
  if (!providerBatchId) {
    throw new Error("Generation batch has not been submitted to OpenAI yet.");
  }

  const provider = await retrieveProviderBatch(providerBatchId);
  const status = providerStatus(provider.status);
  const outputFileId = text(provider.output_file_id);
  const errorFileId = text(provider.error_file_id);
  const now = new Date().toISOString();
  const saved = await admin
    .from("lesson_generation_batches")
    .update({
      status,
      provider_output_file_id: outputFileId,
      provider_error_file_id: errorFileId,
      provider_batch_object: provider as unknown as Json,
      provider_request_counts: (provider.request_counts ?? {}) as Json,
      last_synced_at: now,
      completed_at: TERMINAL_PROVIDER_STATUSES.has(status) ? now : null,
      updated_at: now,
    })
    .eq("id", batchId);
  if (saved.error) throw new Error(saved.error.message);

  if (outputFileId) {
    await ingestJsonlFile(admin, batchId, await openAIFileContent(outputFileId));
  }
  if (errorFileId) {
    await ingestJsonlFile(admin, batchId, await openAIFileContent(errorFileId));
  }

  if (TERMINAL_PROVIDER_STATUSES.has(status) && status !== "completed") {
    const pending = await admin
      .from("lesson_generation_requests")
      .update({
        status: "api_failed",
        provider_error: { type: "batch_terminal", batch_status: status } as unknown as Json,
        validation_errors: [
          `OpenAI Batch ended with status ${status} before this lesson completed.`,
        ],
        updated_at: now,
      })
      .eq("generation_batch_id", batchId)
      .in("status", ["planned", "submitted", "api_completed"]);
    if (pending.error) throw new Error(pending.error.message);
  }

  return getGenerationBatchSummary(batchId);
}

export async function syncActiveGenerationBatches(
  limit = 10,
): Promise<GenerationBatchSummary[]> {
  const admin = adminClient();
  const result = await admin
    .from("lesson_generation_batches")
    .select("id")
    .in("status", [...ACTIVE_LOCAL_STATUSES])
    .not("provider_batch_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 20)));
  if (result.error) throw new Error(result.error.message);

  const synced: GenerationBatchSummary[] = [];
  for (const row of result.data ?? []) {
    synced.push(await syncGenerationBatch(String(row.id)));
  }
  return synced;
}
