import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  normalizeBatchLevel,
  parseGeneratedLesson,
  validateGeneratedLesson,
} from "@/lib/admin-lessons/lesson-generation-contract";

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

type RawClient = SupabaseClient;
type AnyRecord = Record<string, unknown>;

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
    ((requests.data ?? []) as AnyRecord[]).filter(
      (request) => request.generation_batch_id === batch.id,
    ),
  ));
}

export async function getGenerationBatchSummary(
  batchId: string,
): Promise<GenerationBatchSummary> {
  const admin = adminClient();
  const [batch, requests] = await Promise.all([
    admin.from("lesson_generation_batches").select("*").eq("id", batchId).maybeSingle(),
    admin.from("lesson_generation_requests").select("status").eq("generation_batch_id", batchId),
  ]);
  if (batch.error || requests.error) {
    throw new Error(
      batch.error?.message || requests.error?.message || "Batch could not be loaded.",
    );
  }
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
  const level = normalizeBatchLevel(staged.jlpt_level);
  if (!level) throw new Error("Staged lesson uses an unsupported JLPT level.");

  let parsed: unknown = candidate;
  const errors: string[] = [];
  if (typeof candidate === "string") {
    try {
      parsed = parseGeneratedLesson(candidate);
    } catch (error) {
      errors.push(
        `JSON parse failed: ${error instanceof Error ? error.message : "Unknown parse error."}`,
      );
      parsed = null;
    }
  }
  if (parsed !== null) {
    errors.push(...validateGeneratedLesson({
      value: parsed,
      targetKanji: strings(staged.target_kanji),
      targetGrammar: strings(staged.target_grammar),
      level,
    }));
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

  return {
    attempted: (staged.data ?? []).length,
    imported,
    failed,
  };
}
