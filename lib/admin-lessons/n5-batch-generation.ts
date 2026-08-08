import "server-only";

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

const MAX_BATCH_LESSONS = 100;
const TARGET_KANJI_COUNT = 5;
const TARGET_GRAMMAR_COUNT = 3;
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

export type GenerationBatchSummary = {
  id: string;
  jlptLevel: string;
  requestedCount: number;
  model: string;
  status: string;
  providerBatchId: string | null;
  createdAt: string;
  submittedAt: string | null;
  lastSyncedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  counts: Record<string, number>;
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
  if (!response.ok) throw new Error(`OpenAI file ${fileId} could not be downloaded: ${raw.slice(0, 300)}`);
  return raw;
}

async function uploadBatchInput(batchId: string, jsonl: string): Promise<string> {
  const form = new FormData();
  form.append("purpose", "batch");
  form.append(
    "file",
    new Blob([jsonl], { type: "application/jsonl" }),
    `aiko-n5-lessons-${batchId}.jsonl`,
  );
  const payload = await openAIJson("/files", { method: "POST", body: form });
  const fileId = text(payload.id);
  if (!fileId) throw new Error("OpenAI did not return an input file id.");
  return fileId;
}

async function createProviderBatch(inputFileId: string, localBatchId: string): Promise<AnyRecord> {
  return openAIJson("/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_file_id: inputFileId,
      endpoint: "/v1/responses",
      completion_window: "24h",
      metadata: {
        aiko_batch_id: localBatchId,
        purpose: "n5_complete_lessons",
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

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join("\u0000");
}

function recordTargetSet(
  values: string[],
  usage: Map<string, number>,
  pairs: Map<string, number>,
): void {
  for (const value of values) usage.set(value, (usage.get(value) ?? 0) + 1);
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const key = pairKey(values[left], values[right]);
      pairs.set(key, (pairs.get(key) ?? 0) + 1);
    }
  }
}

function pickBalancedSet(input: {
  keys: string[];
  count: number;
  usage: Map<string, number>;
  pairs: Map<string, number>;
  salt: string;
}): string[] {
  const selected: string[] = [];
  while (selected.length < input.count) {
    const candidates = input.keys.filter((key) => !selected.includes(key));
    candidates.sort((left, right) => {
      const pairScore = (candidate: string) => selected.reduce(
        (total, chosen) => total + (input.pairs.get(pairKey(candidate, chosen)) ?? 0),
        0,
      );
      const leftScore =
        (input.usage.get(left) ?? 0) * 100_000 +
        pairScore(left) * 1_000 +
        (hash(`${input.salt}:${left}`) % 997);
      const rightScore =
        (input.usage.get(right) ?? 0) * 100_000 +
        pairScore(right) * 1_000 +
        (hash(`${input.salt}:${right}`) % 997);
      return leftScore - rightScore || left.localeCompare(right, "ja");
    });
    const next = candidates[0];
    if (!next) throw new Error("The N5 catalog does not contain enough unique targets.");
    selected.push(next);
  }
  return selected;
}

function applyHistory(
  rows: unknown[],
  kanjiUsage: Map<string, number>,
  kanjiPairs: Map<string, number>,
  grammarUsage: Map<string, number>,
  grammarPairs: Map<string, number>,
  signatures: Set<string>,
): void {
  for (const row of rows) {
    if (!record(row)) continue;
    const status = text(row.status);
    if (status === "api_failed" || status === "invalid") continue;
    const kanji = strings(row.target_kanji);
    const grammar = strings(row.target_grammar);
    if (kanji.length === TARGET_KANJI_COUNT) {
      recordTargetSet(kanji, kanjiUsage, kanjiPairs);
    }
    if (grammar.length === TARGET_GRAMMAR_COUNT) {
      recordTargetSet(grammar, grammarUsage, grammarPairs);
    }
    if (kanji.length && grammar.length) {
      signatures.add(`${[...kanji].sort().join("")}::${[...grammar].sort().join("|")}`);
    }
  }
}

async function planN5Targets(
  admin: RawClient,
  count: number,
  seed: string,
): Promise<PlannedTargets[]> {
  const [kanjiResult, grammarResult, historyResult] = await Promise.all([
    admin
      .from("kanji_records")
      .select("character,quality_status,usage_count,archived_at")
      .eq("jlpt_level", "N5")
      .is("archived_at", null),
    admin
      .from("grammar_records")
      .select("pattern,quality_status,usage_count,archived_at")
      .eq("jlpt_level", "N5")
      .is("archived_at", null),
    admin
      .from("lesson_generation_requests")
      .select("target_kanji,target_grammar,status")
      .eq("jlpt_level", "N5"),
  ]);
  const error = kanjiResult.error || grammarResult.error || historyResult.error;
  if (error) throw new Error(error.message);

  const kanjiRows = (kanjiResult.data ?? []).filter(
    (row) => record(row) && row.quality_status !== "rejected" && text(row.character),
  ) as AnyRecord[];
  const grammarRows = (grammarResult.data ?? []).filter(
    (row) => record(row) && row.quality_status !== "rejected" && text(row.pattern),
  ) as AnyRecord[];
  const kanjiKeys = [...new Set(kanjiRows.map((row) => text(row.character)).filter(Boolean) as string[])];
  const grammarKeys = [...new Set(grammarRows.map((row) => text(row.pattern)).filter(Boolean) as string[])];

  if (kanjiKeys.length < TARGET_KANJI_COUNT) {
    throw new Error(`N5 needs at least ${TARGET_KANJI_COUNT} usable kanji records before batch generation.`);
  }
  if (grammarKeys.length < TARGET_GRAMMAR_COUNT) {
    throw new Error(`N5 needs at least ${TARGET_GRAMMAR_COUNT} usable grammar records before batch generation.`);
  }

  const kanjiUsage = new Map<string, number>();
  const grammarUsage = new Map<string, number>();
  for (const row of kanjiRows) {
    const key = text(row.character);
    if (key) kanjiUsage.set(key, Math.max(0, numeric(row.usage_count) ?? 0));
  }
  for (const row of grammarRows) {
    const key = text(row.pattern);
    if (key) grammarUsage.set(key, Math.max(0, numeric(row.usage_count) ?? 0));
  }
  const kanjiPairs = new Map<string, number>();
  const grammarPairs = new Map<string, number>();
  const signatures = new Set<string>();
  applyHistory(
    historyResult.data ?? [],
    kanjiUsage,
    kanjiPairs,
    grammarUsage,
    grammarPairs,
    signatures,
  );

  const plans: PlannedTargets[] = [];
  for (let sequence = 1; sequence <= count; sequence += 1) {
    let accepted: PlannedTargets | null = null;
    for (let attempt = 0; attempt < 30 && !accepted; attempt += 1) {
      const targetKanji = pickBalancedSet({
        keys: kanjiKeys,
        count: TARGET_KANJI_COUNT,
        usage: kanjiUsage,
        pairs: kanjiPairs,
        salt: `${seed}:kanji:${sequence}:${attempt}`,
      });
      const targetGrammar = pickBalancedSet({
        keys: grammarKeys,
        count: TARGET_GRAMMAR_COUNT,
        usage: grammarUsage,
        pairs: grammarPairs,
        salt: `${seed}:grammar:${sequence}:${attempt}`,
      });
      const signature = `${[...targetKanji].sort().join("")}::${[...targetGrammar].sort().join("|")}`;
      if (!signatures.has(signature) || attempt === 29) {
        signatures.add(signature);
        accepted = { targetKanji, targetGrammar };
      }
    }
    if (!accepted) throw new Error("Could not construct a unique N5 target combination.");
    recordTargetSet(accepted.targetKanji, kanjiUsage, kanjiPairs);
    recordTargetSet(accepted.targetGrammar, grammarUsage, grammarPairs);
    plans.push(accepted);
  }
  return plans;
}

function buildLessonPrompt(
  customId: string,
  targetKanji: string[],
  targetGrammar: string[],
): string {
  const lessonId = `lesson_${customId}`;
  const base = COMPLETE_LESSON_CHAT_PROMPT
    .replace(
      "- Topic: <REPLACE_TOPIC>",
      "- Topic: Choose an original, natural N5-appropriate topic yourself. Make the target kanji and grammar fit the story naturally.",
    )
    .replace("- JLPT level: <REPLACE_LEVEL: N5|N4|N3|N2|N1>", "- JLPT level: N5")
    .replace("- Learner interests: <REPLACE_INTERESTS_OR_NONE>", "- Learner interests: None; choose the topic independently")
    .replace("- Target kanji: <REPLACE_WITH_EXACTLY_5_KANJI>", `- Target kanji: ${targetKanji.join("、")}`)
    .replace("- Target grammar: <REPLACE_WITH_EXACTLY_3_GRAMMAR_PATTERNS>", `- Target grammar: ${targetGrammar.join(" / ")}`);

  return `${base}\n\nBATCH-SPECIFIC REQUIREMENTS\n- Set the top-level id to exactly \"${lessonId}\".\n- The top-level kanji array must contain exactly these five target characters, with no substitutions: ${targetKanji.join("、")}.\n- Each target kanji must appear naturally in the main Japanese story.\n- The top-level grammar array must contain exactly these three target patterns, with no substitutions: ${targetGrammar.join(" / ")}.\n- Every target grammar pattern must be tested by at least one grammarQuestions targetRefs entry.\n- Choose the topic yourself. Do not mention these controls or say that a topic was assigned.\n- Prefer a distinctive everyday scenario rather than repeating generic school self-introductions unless the targets genuinely call for it.\n- Keep every Listening transcript below 1,200 characters so stored TTS can be generated.\n- Return only the complete JSON object.`;
}

function buildLessonRequestBody(prompt: string, model: string): Record<string, unknown> {
  return buildOpenAIResponsesRequest({
    model,
    prompt,
    schema: COMPLETE_LESSON_BATCH_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "complete_n5_lesson",
    reasoningEffort: reasoningEffort(),
    strictSchema: false,
  });
}

function targetValidationErrors(
  value: unknown,
  targetKanji: string[],
  targetGrammar: string[],
): string[] {
  if (!record(value)) return ["Generated lesson is not a JSON object."];
  const errors: string[] = [];
  const actualKanji = Array.isArray(value.kanji)
    ? value.kanji.map((item) => record(item) ? text(item.character) : null).filter(Boolean) as string[]
    : [];
  const actualGrammar = Array.isArray(value.grammar)
    ? value.grammar.map((item) => record(item) ? text(item.pattern) : null).filter(Boolean) as string[]
    : [];
  const sameSet = (left: string[], right: string[]) =>
    left.length === right.length &&
    [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
  if (!sameSet(actualKanji, targetKanji)) {
    errors.push(`Target kanji mismatch. Expected: ${targetKanji.join("、")}.`);
  }
  if (!sameSet(actualGrammar, targetGrammar)) {
    errors.push(`Target grammar mismatch. Expected: ${targetGrammar.join(" / ")}.`);
  }
  if (text(value.level) !== "N5") errors.push("Generated lesson level must remain N5.");

  const storyText = Array.isArray(value.story)
    ? value.story.map((item) => record(item) ? text(item.japanese) ?? "" : "").join("\n")
    : "";
  for (const character of targetKanji) {
    if (!storyText.includes(character)) errors.push(`Target kanji ${character} is missing from the main story.`);
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
        errors.push(`Listening transcript ${index + 1} exceeds the 1,200-character stored-TTS limit.`);
      }
    });
  }
  return errors;
}

function validateStagedLesson(
  value: unknown,
  targetKanji: string[],
  targetGrammar: string[],
): string[] {
  return [...new Set([
    ...validateCompleteLessonImport(value).errors,
    ...targetValidationErrors(value, targetKanji, targetGrammar),
  ])];
}

function extractResponseText(body: AnyRecord): { output: string | null; error: unknown | null } {
  const direct = text(body.output_text);
  if (direct) return { output: direct, error: null };
  if (!Array.isArray(body.output)) return { output: null, error: body.error ?? null };
  const parts: string[] = [];
  const refusals: string[] = [];
  for (const item of body.output) {
    if (!record(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!record(content)) continue;
      if (content.type === "output_text" && text(content.text)) parts.push(text(content.text) as string);
      if (content.type === "refusal" && text(content.refusal)) refusals.push(text(content.refusal) as string);
    }
  }
  return {
    output: parts.length ? parts.join("\n") : null,
    error: refusals.length ? { type: "refusal", messages: refusals } : body.error ?? null,
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

async function appendUnmatchedLine(admin: RawClient, batchId: string, raw: unknown): Promise<void> {
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
    .select("id,target_kanji,target_grammar,status")
    .eq("generation_batch_id", batchId)
    .eq("custom_id", customId)
    .maybeSingle();
  if (staged.error) throw new Error(staged.error.message);
  if (!staged.data) {
    await appendUnmatchedLine(admin, batchId, line);
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
        validation_errors: ["The Batch request failed before a complete lesson response was available."],
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
        provider_error: (extracted.error ?? { message: "Response contained no output_text." }) as Json,
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

async function ingestJsonlFile(admin: RawClient, batchId: string, content: string): Promise<void> {
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

export async function submitN5LessonBatch(input: {
  count: number;
  userId: string;
}): Promise<{ batchId: string; providerBatchId: string; requestedCount: number }> {
  const count = Math.round(input.count);
  if (count < 1 || count > MAX_BATCH_LESSONS) {
    throw new Error(`N5 Batch generation accepts 1-${MAX_BATCH_LESSONS} lessons at a time.`);
  }
  const admin = adminClient();
  const model = lessonModel();
  const created = await admin
    .from("lesson_generation_batches")
    .insert({
      jlpt_level: "N5",
      requested_count: count,
      model,
      status: "planning",
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (created.error || !created.data) throw new Error(created.error?.message || "Generation batch could not be created.");
  const batchId = String(created.data.id);

  try {
    const plans = await planN5Targets(admin, count, batchId);
    const rows = plans.map((plan, index) => {
      const sequence = index + 1;
      const customId = `n5_${batchId.replace(/-/gu, "").slice(0, 12)}_${String(sequence).padStart(3, "0")}`;
      const prompt = buildLessonPrompt(customId, plan.targetKanji, plan.targetGrammar);
      const requestBody = buildLessonRequestBody(prompt, model);
      return {
        generation_batch_id: batchId,
        custom_id: customId,
        sequence_number: sequence,
        jlpt_level: "N5",
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

    const jsonl = rows.map((row) => JSON.stringify({
      custom_id: row.custom_id,
      method: "POST",
      url: "/v1/responses",
      body: row.request_body,
    })).join("\n");
    const inputFileId = await uploadBatchInput(batchId, jsonl);
    const provider = await createProviderBatch(inputFileId, batchId);
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
      throw new Error(batchSaved.error?.message || requestsSaved.error?.message || "Batch state could not be saved.");
    }
    return { batchId, providerBatchId, requestedCount: count };
  } catch (error) {
    await admin
      .from("lesson_generation_batches")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message.slice(0, 2_000) : "Batch submission failed.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId);
    throw error;
  }
}

export async function syncGenerationBatch(batchId: string): Promise<GenerationBatchSummary> {
  const admin = adminClient();
  const local = await admin
    .from("lesson_generation_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();
  if (local.error) throw new Error(local.error.message);
  if (!local.data) throw new Error("Generation batch not found.");
  const providerBatchId = text(local.data.provider_batch_id);
  if (!providerBatchId) throw new Error("Generation batch has not been submitted to OpenAI yet.");

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

  if (outputFileId) await ingestJsonlFile(admin, batchId, await openAIFileContent(outputFileId));
  if (errorFileId) await ingestJsonlFile(admin, batchId, await openAIFileContent(errorFileId));

  if (TERMINAL_PROVIDER_STATUSES.has(status) && status !== "completed") {
    const pending = await admin
      .from("lesson_generation_requests")
      .update({
        status: "api_failed",
        provider_error: { type: "batch_terminal", batch_status: status } as unknown as Json,
        validation_errors: [`OpenAI Batch ended with status ${status} before this lesson completed.`],
        updated_at: now,
      })
      .eq("generation_batch_id", batchId)
      .in("status", ["planned", "submitted", "api_completed"]);
    if (pending.error) throw new Error(pending.error.message);
  }
  return getGenerationBatchSummary(batchId);
}

export async function syncActiveGenerationBatches(limit = 10): Promise<GenerationBatchSummary[]> {
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
  for (const row of result.data ?? []) synced.push(await syncGenerationBatch(String(row.id)));
  return synced;
}

function summarizeBatch(batch: AnyRecord, requests: AnyRecord[]): GenerationBatchSummary {
  const counts: Record<string, number> = {};
  for (const request of requests) {
    const status = text(request.status) || "unknown";
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return {
    id: String(batch.id),
    jlptLevel: text(batch.jlpt_level) || "N5",
    requestedCount: numeric(batch.requested_count) ?? requests.length,
    model: text(batch.model) || "unknown",
    status: text(batch.status) || "unknown",
    providerBatchId: text(batch.provider_batch_id),
    createdAt: text(batch.created_at) || "",
    submittedAt: text(batch.submitted_at),
    lastSyncedAt: text(batch.last_synced_at),
    completedAt: text(batch.completed_at),
    errorMessage: text(batch.error_message),
    counts,
  };
}

export async function listGenerationBatches(limit = 30): Promise<GenerationBatchSummary[]> {
  const admin = adminClient();
  const batches = await admin
    .from("lesson_generation_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));
  if (batches.error) throw new Error(batches.error.message);
  const rows = (batches.data ?? []) as AnyRecord[];
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const requests = await admin
    .from("lesson_generation_requests")
    .select("generation_batch_id,status")
    .in("generation_batch_id", ids);
  if (requests.error) throw new Error(requests.error.message);
  return rows.map((batch) => summarizeBatch(
    batch,
    ((requests.data ?? []) as AnyRecord[]).filter((request) => request.generation_batch_id === batch.id),
  ));
}

export async function getGenerationBatchSummary(batchId: string): Promise<GenerationBatchSummary> {
  const admin = adminClient();
  const [batch, requests] = await Promise.all([
    admin.from("lesson_generation_batches").select("*").eq("id", batchId).maybeSingle(),
    admin.from("lesson_generation_requests").select("status").eq("generation_batch_id", batchId),
  ]);
  if (batch.error || requests.error) throw new Error(batch.error?.message || requests.error?.message || "Batch could not be loaded.");
  if (!batch.data) throw new Error("Generation batch not found.");
  return summarizeBatch(batch.data as AnyRecord, (requests.data ?? []) as AnyRecord[]);
}

export async function getGenerationBatchDetail(batchId: string): Promise<{
  batch: GenerationBatchSummary;
  requests: Array<{
    id: string;
    customId: string;
    sequenceNumber: number;
    targetKanji: string[];
    targetGrammar: string[];
    status: string;
    validationErrors: string[];
    importError: string | null;
    manuallyFixed: boolean;
  }>;
}> {
  const admin = adminClient();
  const requests = await admin
    .from("lesson_generation_requests")
    .select("id,custom_id,sequence_number,target_kanji,target_grammar,status,validation_errors,import_error,manually_fixed_at")
    .eq("generation_batch_id", batchId)
    .order("sequence_number");
  if (requests.error) throw new Error(requests.error.message);
  return {
    batch: await getGenerationBatchSummary(batchId),
    requests: ((requests.data ?? []) as AnyRecord[]).map((row) => ({
      id: String(row.id),
      customId: text(row.custom_id) || "",
      sequenceNumber: numeric(row.sequence_number) ?? 0,
      targetKanji: strings(row.target_kanji),
      targetGrammar: strings(row.target_grammar),
      status: text(row.status) || "unknown",
      validationErrors: strings(row.validation_errors),
      importError: text(row.import_error),
      manuallyFixed: Boolean(row.manually_fixed_at),
    })),
  };
}

export async function getGenerationRequest(requestId: string): Promise<AnyRecord> {
  const admin = adminClient();
  const result = await admin
    .from("lesson_generation_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Generated lesson staging record not found.");
  return result.data as AnyRecord;
}

export async function saveManualGenerationLesson(
  requestId: string,
  candidate: unknown,
): Promise<{ status: "valid" | "invalid"; errors: string[] }> {
  const admin = adminClient();
  const staged = await getGenerationRequest(requestId);
  let parsed: unknown = candidate;
  const errors: string[] = [];
  if (typeof candidate === "string") {
    try {
      parsed = parseCompleteLessonImport(candidate);
    } catch (error) {
      errors.push(`JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error."}`);
      parsed = null;
    }
  }
  if (parsed !== null) {
    errors.push(...validateStagedLesson(
      parsed,
      strings(staged.target_kanji),
      strings(staged.target_grammar),
    ));
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

export async function importValidGenerationRequests(input: {
  batchId: string;
  authenticatedClient: SupabaseClient;
  requestId?: string;
}): Promise<{ attempted: number; imported: number; failed: number }> {
  const admin = adminClient();
  let query = admin
    .from("lesson_generation_requests")
    .select("id,parsed_lesson,edited_lesson")
    .eq("generation_batch_id", input.batchId)
    .eq("status", "valid")
    .is("imported_at", null)
    .order("sequence_number");
  if (input.requestId) query = query.eq("id", input.requestId);
  const staged = await query;
  if (staged.error) throw new Error(staged.error.message);

  let imported = 0;
  let failed = 0;
  for (const row of (staged.data ?? []) as AnyRecord[]) {
    const lesson = row.edited_lesson ?? row.parsed_lesson;
    if (!record(lesson)) {
      failed += 1;
      await admin.from("lesson_generation_requests").update({
        import_error: "Validated lesson JSON is missing.",
        updated_at: new Date().toISOString(),
      }).eq("id", String(row.id));
      continue;
    }
    const rpc = await (input.authenticatedClient as unknown as RawClient).rpc(
      "import_complete_lesson",
      { p_package: lesson as unknown as Json, p_publish: true },
    );
    if (rpc.error) {
      failed += 1;
      await admin.from("lesson_generation_requests").update({
        import_error: rpc.error.message.slice(0, 2_000),
        updated_at: new Date().toISOString(),
      }).eq("id", String(row.id));
      continue;
    }
    const result = record(rpc.data) ? rpc.data : {};
    imported += 1;
    const now = new Date().toISOString();
    await admin.from("lesson_generation_requests").update({
      status: "imported",
      imported_lesson_id: text(result.lesson_id),
      imported_lesson_version_id: text(result.lesson_version_id),
      imported_at: now,
      import_error: null,
      updated_at: now,
    }).eq("id", String(row.id));
  }
  return { attempted: (staged.data ?? []).length, imported, failed };
}
