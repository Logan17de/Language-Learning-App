import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOpenAIResponsesRequest,
  type OpenAIReasoningEffort,
} from "@/lib/openai/api-request";
import {
  parseCompleteLessonImport,
  validateCompleteLessonImport,
} from "@/lib/admin-complete-lesson-import";
import { COMPLETE_LESSON_CHAT_PROMPT } from "@/lib/admin-complete-lesson-prompt";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  getGenerationBatchDetail,
  getGenerationBatchSummary,
  getGenerationRequest,
  importValidGenerationRequests,
  listGenerationBatches,
  type GenerationBatchSummary,
} from "@/lib/admin-lessons/n5-batch-generation";

export {
  getGenerationBatchDetail,
  getGenerationBatchSummary,
  getGenerationRequest,
  importValidGenerationRequests,
  listGenerationBatches,
};
export type { GenerationBatchSummary };

export const SUPPORTED_BATCH_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type SupportedBatchLevel = (typeof SUPPORTED_BATCH_LEVELS)[number];

const MAX_BATCH_LESSONS = 100;
const TARGET_KANJI_COUNT = 5;
const TARGET_GRAMMAR_COUNT = 3;
const UNIQUE_DRAW_ATTEMPTS = 5_000;
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

const COMPLETE_LESSON_BATCH_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { type: "integer" },
    id: { type: "string" },
    title: { type: "string" },
    japaneseTitle: { type: "string" },
    topic: { type: "string" },
    level: { type: "string" },
    durationMinutes: { type: "integer" },
    tags: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    storyPreview: { type: "string" },
    kanji: { type: "array", items: { type: "object" } },
    grammar: { type: "array", items: { type: "object" } },
    vocabulary: { type: "array", items: { type: "object" } },
    story: { type: "array", items: { type: "object" } },
    vocabularyQuestions: { type: "array", items: { type: "object" } },
    grammarQuestions: { type: "array", items: { type: "object" } },
    speakingExercises: { type: "array", items: { type: "object" } },
    readingTitle: { type: "string" },
    readingJapaneseTitle: { type: "string" },
    readingConversation: { type: "array", items: { type: "object" } },
    readingQuestions: { type: "array", items: { type: "object" } },
    listeningExercises: { type: "array", items: { type: "object" } },
    reviewQuestions: { type: "array", items: { type: "object" } },
  },
  required: [
    "schemaVersion",
    "id",
    "title",
    "japaneseTitle",
    "topic",
    "level",
    "durationMinutes",
    "tags",
    "summary",
    "storyPreview",
    "kanji",
    "grammar",
    "vocabulary",
    "story",
    "vocabularyQuestions",
    "grammarQuestions",
    "speakingExercises",
    "readingTitle",
    "readingJapaneseTitle",
    "readingConversation",
    "readingQuestions",
    "listeningExercises",
    "reviewQuestions",
  ],
} as const;

type RawClient = SupabaseClient;
type AnyRecord = Record<string, unknown>;

type PlannedTargets = {
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

export function normalizeBatchLevel(value: unknown): SupportedBatchLevel | null {
  return SUPPORTED_BATCH_LEVELS.includes(value as SupportedBatchLevel)
    ? value as SupportedBatchLevel
    : null;
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
        purpose: `${level.toLowerCase()}_complete_lessons`,
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

export function targetSetSignature(values: string[]): string {
  return [...values].sort((left, right) => left.localeCompare(right, "ja")).join("\u0000");
}

function randomTargetSet(keys: string[], count: number): string[] {
  const pool = [...keys];
  for (let index = 0; index < count; index += 1) {
    const swapIndex = randomInt(index, pool.length);
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

function chooseUnusedRandomSet(input: {
  keys: string[];
  count: number;
  used: Set<string>;
  label: string;
}): string[] {
  for (let attempt = 0; attempt < UNIQUE_DRAW_ATTEMPTS; attempt += 1) {
    const candidate = randomTargetSet(input.keys, input.count);
    const signature = targetSetSignature(candidate);
    if (!input.used.has(signature)) {
      input.used.add(signature);
      return candidate;
    }
  }
  throw new Error(
    `Could not find a new ${input.label} combination after ${UNIQUE_DRAW_ATTEMPTS.toLocaleString()} random draws. The available unique combinations may be exhausted.`,
  );
}

async function planRandomUniqueTargets(
  admin: RawClient,
  count: number,
  level: SupportedBatchLevel,
): Promise<PlannedTargets[]> {
  const [kanjiResult, grammarResult, historyResult] = await Promise.all([
    admin
      .from("kanji_records")
      .select("character,quality_status,archived_at")
      .eq("jlpt_level", level)
      .is("archived_at", null),
    admin
      .from("grammar_records")
      .select("pattern,quality_status,archived_at")
      .eq("jlpt_level", level)
      .is("archived_at", null),
    admin
      .from("lesson_generation_requests")
      .select("target_kanji")
      .eq("jlpt_level", level),
  ]);
  const error = kanjiResult.error || grammarResult.error || historyResult.error;
  if (error) throw new Error(error.message);

  const kanjiKeys = [...new Set(
    (kanjiResult.data ?? [])
      .filter((row) => record(row) && row.quality_status !== "rejected" && text(row.character))
      .map((row) => text(row.character) as string),
  )];
  const grammarKeys = [...new Set(
    (grammarResult.data ?? [])
      .filter((row) => record(row) && row.quality_status !== "rejected" && text(row.pattern))
      .map((row) => text(row.pattern) as string),
  )];

  if (kanjiKeys.length < TARGET_KANJI_COUNT) {
    throw new Error(`${level} needs at least ${TARGET_KANJI_COUNT} usable kanji records before Batch generation.`);
  }
  if (grammarKeys.length < TARGET_GRAMMAR_COUNT) {
    throw new Error(`${level} needs at least ${TARGET_GRAMMAR_COUNT} usable grammar records before Batch generation.`);
  }

  const usedKanjiSets = new Set<string>();
  for (const row of historyResult.data ?? []) {
    if (!record(row)) continue;
    const kanji = strings(row.target_kanji);
    if (kanji.length === TARGET_KANJI_COUNT) {
      usedKanjiSets.add(targetSetSignature(kanji));
    }
  }

  const plans: PlannedTargets[] = [];
  for (let sequence = 0; sequence < count; sequence += 1) {
    plans.push({
      targetKanji: chooseUnusedRandomSet({
        keys: kanjiKeys,
        count: TARGET_KANJI_COUNT,
        used: usedKanjiSets,
        label: `${level} five-kanji`,
      }),
      targetGrammar: randomTargetSet(grammarKeys, TARGET_GRAMMAR_COUNT),
    });
  }
  return plans;
}

function buildLessonPrompt(
  customId: string,
  level: SupportedBatchLevel,
  targetKanji: string[],
  targetGrammar: string[],
): string {
  const lessonId = `lesson_${customId}`;
  const base = COMPLETE_LESSON_CHAT_PROMPT
    .replace(
      "- Topic: <REPLACE_TOPIC>",
      `- Topic: Choose an original, natural ${level}-appropriate topic yourself. Make the target kanji and grammar fit the story naturally.`,
    )
    .replace(
      "- JLPT level: <REPLACE_LEVEL: N5|N4|N3|N2|N1>",
      `- JLPT level: ${level}`,
    )
    .replace(
      "- Learner interests: <REPLACE_INTERESTS_OR_NONE>",
      "- Learner interests: None; choose the topic independently",
    )
    .replace(
      "- Target kanji: <REPLACE_WITH_EXACTLY_5_KANJI>",
      `- Target kanji: ${targetKanji.join("、")}`,
    )
    .replace(
      "- Target grammar: <REPLACE_WITH_EXACTLY_3_GRAMMAR_PATTERNS>",
      `- Target grammar: ${targetGrammar.join(" / ")}`,
    );

  return `${base}\n\nBATCH-SPECIFIC REQUIREMENTS\n- Set the top-level id to exactly \"${lessonId}\".\n- Keep the top-level level exactly \"${level}\".\n- The top-level kanji array must contain exactly these five target characters, with no substitutions: ${targetKanji.join("、")}.\n- Each target kanji must appear naturally in the main Japanese story.\n- The top-level grammar array must contain exactly these three target patterns, with no substitutions: ${targetGrammar.join(" / ")}.\n- Every target grammar pattern must be tested by at least one grammarQuestions targetRefs entry.\n- Choose the topic yourself. Do not mention these controls or say that a topic was assigned.\n- Prefer a distinctive everyday scenario rather than repeating generic school self-introductions unless the targets genuinely call for it.\n- Keep every Listening transcript below 1,200 characters so stored TTS can be generated.\n- Return only the complete JSON object.`;
}

function buildLessonRequestBody(
  prompt: string,
  model: string,
  level: SupportedBatchLevel,
): Record<string, unknown> {
  return buildOpenAIResponsesRequest({
    model,
    prompt,
    schema: COMPLETE_LESSON_BATCH_SCHEMA as unknown as Record<string, unknown>,
    schemaName: `complete_${level.toLowerCase()}_lesson`,
    reasoningEffort: reasoningEffort(),
    strictSchema: false,
  });
}

function targetValidationErrors(
  value: unknown,
  targetKanji: string[],
  targetGrammar: string[],
  level: SupportedBatchLevel,
): string[] {
  if (!record(value)) return ["Generated lesson is not a JSON object."];
  const errors: string[] = [];
  const actualKanji = Array.isArray(value.kanji)
    ? value.kanji
      .map((item) => record(item) ? text(item.character) : null)
      .filter(Boolean) as string[]
    : [];
  const actualGrammar = Array.isArray(value.grammar)
    ? value.grammar
      .map((item) => record(item) ? text(item.pattern) : null)
      .filter(Boolean) as string[]
    : [];
  const sameSet = (left: string[], right: string[]) =>
    left.length === right.length && targetSetSignature(left) === targetSetSignature(right);

  if (!sameSet(actualKanji, targetKanji)) {
    errors.push(`Target kanji mismatch. Expected: ${targetKanji.join("、")}.`);
  }
  if (!sameSet(actualGrammar, targetGrammar)) {
    errors.push(`Target grammar mismatch. Expected: ${targetGrammar.join(" / ")}.`);
  }
  if (text(value.level) !== level) {
    errors.push(`Generated lesson level must remain ${level}.`);
  }

  const storyText = Array.isArray(value.story)
    ? value.story
      .map((item) => record(item) ? text(item.japanese) ?? "" : "")
      .join("\n")
    : "";
  for (const character of targetKanji) {
    if (!storyText.includes(character)) {
      errors.push(`Target kanji ${character} is missing from the main story.`);
    }
  }

  const grammarRefs = new Set<string>();
  if (Array.isArray(value.grammarQuestions)) {
    for (const question of value.grammarQuestions) {
      if (!record(question)) continue;
      for (const ref of strings(question.targetRefs)) grammarRefs.add(ref);
    }
  }
  for (const pattern of targetGrammar) {
    if (!grammarRefs.has(`grammar:${pattern}`)) {
      errors.push(`Target grammar ${pattern} is not tested in grammarQuestions.`);
    }
  }

  if (Array.isArray(value.listeningExercises)) {
    value.listeningExercises.forEach((item, index) => {
      if (record(item) && (text(item.transcript)?.length ?? 0) > 1_200) {
        errors.push(
          `Listening transcript ${index + 1} exceeds the 1,200-character stored-TTS limit.`,
        );
      }
    });
  }
  return errors;
}

function validateStagedLesson(
  value: unknown,
  targetKanji: string[],
  targetGrammar: string[],
  level: SupportedBatchLevel,
): string[] {
  return [...new Set([
    ...validateCompleteLessonImport(value).errors,
    ...targetValidationErrors(value, targetKanji, targetGrammar, level),
  ])];
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
    .select("id,target_kanji,target_grammar,jlpt_level,status")
    .eq("generation_batch_id", batchId)
    .eq("custom_id", customId)
    .maybeSingle();
  if (staged.error) throw new Error(staged.error.message);
  if (!staged.data) {
    await appendUnmatchedLine(admin, batchId, line);
    return;
  }

  const level = normalizeBatchLevel(staged.data.jlpt_level);
  if (!level) {
    const failed = await admin
      .from("lesson_generation_requests")
      .update({
        raw_provider_line: line as unknown as Json,
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
  const baseUpdate: Record<string, unknown> = {
    raw_provider_line: line as unknown as Json,
    updated_at: new Date().toISOString(),
  };

  if (!body || !statusCode || statusCode < 200 || statusCode >= 300) {
    const failed = await admin
      .from("lesson_generation_requests")
      .update({
        ...baseUpdate,
        status: "api_failed",
        provider_error: (lineError ?? { status_code: statusCode }) as Json,
        validation_errors: [
          "The Batch request failed before a complete lesson response was available.",
        ],
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
        ...baseUpdate,
        ...usage,
        provider_request_id: text(body.id),
        status: "api_failed",
        provider_error: (
          extracted.error ?? { message: "Response contained no output_text." }
        ) as Json,
        validation_errors: ["The model returned no lesson JSON text."],
      })
      .eq("id", staged.data.id);
    if (failed.error) throw new Error(failed.error.message);
    return;
  }

  let parsed: unknown = null;
  let errors: string[] = [];
  try {
    parsed = parseCompleteLessonImport(extracted.output);
    errors = validateStagedLesson(
      parsed,
      strings(staged.data.target_kanji),
      strings(staged.data.target_grammar),
      level,
    );
  } catch (error) {
    errors = [
      `JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error."}`,
    ];
  }

  const saved = await admin
    .from("lesson_generation_requests")
    .update({
      ...baseUpdate,
      ...usage,
      raw_response: extracted.output,
      parsed_lesson: parsed as Json | null,
      provider_error: extracted.error as Json | null,
      provider_request_id: text(body.id),
      status: errors.length ? "invalid" : "valid",
      validation_errors: errors,
      last_validated_at: new Date().toISOString(),
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
    const plans = await planRandomUniqueTargets(admin, count, level);
    const rows = plans.map((plan, index) => {
      const sequence = index + 1;
      const customId = `${level.toLowerCase()}_${batchId.replace(/-/gu, "").slice(0, 12)}_${String(sequence).padStart(3, "0")}`;
      const prompt = buildLessonPrompt(
        customId,
        level,
        plan.targetKanji,
        plan.targetGrammar,
      );
      const requestBody = buildLessonRequestBody(prompt, model, level);
      return {
        generation_batch_id: batchId,
        custom_id: customId,
        sequence_number: sequence,
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
    return {
      batchId,
      providerBatchId,
      requestedCount: count,
      level,
    };
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

export async function saveManualGenerationLesson(
  requestId: string,
  candidate: unknown,
): Promise<{ status: "valid" | "invalid"; errors: string[] }> {
  const admin = adminClient();
  const staged = await getGenerationRequest(requestId);
  const level = normalizeBatchLevel(staged.jlpt_level);
  if (!level) throw new Error("Staged lesson uses an unsupported JLPT level.");

  let parsed: unknown = candidate;
  const errors: string[] = [];
  if (typeof candidate === "string") {
    try {
      parsed = parseCompleteLessonImport(candidate);
    } catch (error) {
      errors.push(
        `JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error."}`,
      );
      parsed = null;
    }
  }
  if (parsed !== null) {
    errors.push(
      ...validateStagedLesson(
        parsed,
        strings(staged.target_kanji),
        strings(staged.target_grammar),
        level,
      ),
    );
  }

  const uniqueErrors = [...new Set(errors)];
  const status = uniqueErrors.length ? "invalid" : "valid";
  const now = new Date().toISOString();
  const saved = await admin
    .from("lesson_generation_requests")
    .update({
      edited_lesson: parsed as Json | null,
      status,
      validation_errors: uniqueErrors,
      last_validated_at: now,
      manually_fixed_at: now,
      import_error: null,
      updated_at: now,
    })
    .eq("id", requestId);
  if (saved.error) throw new Error(saved.error.message);
  return { status, errors: uniqueErrors };
}
