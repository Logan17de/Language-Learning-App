import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareStoredLessonAudio } from "@/lib/audio/audio-library";
import { createAdminClient } from "@/lib/supabase/admin";

const LESSON_CONCURRENCY = 4;
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 15 * 60 * 1000;

type AdminClient = SupabaseClient;

type BatchRow = {
  id: string;
  status: "queued" | "processing" | "completed" | "partial" | "failed";
  lesson_count: number;
};

type QueueRow = {
  id: string;
  lesson_version_id: string;
  status: "pending" | "batched" | "processing" | "ready" | "failed";
  attempts: number;
  generated_audio_count: number;
  reused_audio_count: number;
  linked_audio_count: number;
  error_message: string | null;
};

export interface LessonTtsBatchResult {
  batchId: string;
  status: BatchRow["status"];
  lessonCount: number;
  processedCount: number;
  readyCount: number;
  failedCount: number;
  generatedAudioCount: number;
  reusedAudioCount: number;
  linkedAudioCount: number;
}

function adminClient(): AdminClient {
  return createAdminClient() as unknown as AdminClient;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "TTS preparation failed.");
}

async function inParallel<T>(
  values: T[],
  worker: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const count = Math.min(LESSON_CONCURRENCY, values.length);
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        await worker(values[index]);
      }
    }),
  );
}

async function loadBatch(
  admin: AdminClient,
  batchId?: string,
): Promise<BatchRow | null> {
  let query = admin
    .from("lesson_tts_batches")
    .select("id,status,lesson_count")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1);
  if (batchId) query = query.eq("id", batchId);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as BatchRow | null) ?? null;
}

async function resetStaleClaims(admin: AdminClient, batchId: string): Promise<void> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const result = await admin
    .from("lesson_tts_queue")
    .update({
      status: "batched",
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("batch_id", batchId)
    .eq("status", "processing")
    .lt("claimed_at", staleBefore);
  if (result.error) throw new Error(result.error.message);
}

async function claimItem(
  admin: AdminClient,
  row: QueueRow,
): Promise<QueueRow | null> {
  const result = await admin
    .from("lesson_tts_queue")
    .update({
      status: "processing",
      claimed_at: new Date().toISOString(),
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("status", "batched")
    .select(
      "id,lesson_version_id,status,attempts,generated_audio_count,reused_audio_count,linked_audio_count,error_message",
    )
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as QueueRow | null) ?? null;
}

async function processItem(admin: AdminClient, source: QueueRow): Promise<void> {
  const claimed = await claimItem(admin, source);
  if (!claimed) return;

  let lastError = "";
  let attempts = claimed.attempts;
  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const attemptUpdate = await admin
      .from("lesson_tts_queue")
      .update({ attempts, updated_at: new Date().toISOString() })
      .eq("id", claimed.id)
      .eq("status", "processing");
    if (attemptUpdate.error) throw new Error(attemptUpdate.error.message);

    try {
      const prepared = await prepareStoredLessonAudio(
        claimed.lesson_version_id,
        admin,
      );
      const saved = await admin
        .from("lesson_tts_queue")
        .update({
          status: "ready",
          attempts,
          generated_audio_count: prepared.generated,
          reused_audio_count: prepared.reused,
          linked_audio_count: prepared.linked,
          error_message: null,
          claimed_at: null,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", claimed.id)
        .eq("status", "processing");
      if (saved.error) throw new Error(saved.error.message);
      return;
    } catch (error) {
      lastError = errorMessage(error).slice(0, 1_000);
      console.error("Imported lesson TTS attempt failed.", {
        queueId: claimed.id,
        lessonVersionId: claimed.lesson_version_id,
        attempt: attempts,
        message: lastError,
      });
    }
  }

  const failed = await admin
    .from("lesson_tts_queue")
    .update({
      status: "failed",
      attempts,
      error_message: lastError || "TTS preparation failed.",
      claimed_at: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", claimed.id)
    .eq("status", "processing");
  if (failed.error) throw new Error(failed.error.message);
}

async function summarizeBatch(
  admin: AdminClient,
  batch: BatchRow,
): Promise<LessonTtsBatchResult> {
  const result = await admin
    .from("lesson_tts_queue")
    .select(
      "id,lesson_version_id,status,attempts,generated_audio_count,reused_audio_count,linked_audio_count,error_message",
    )
    .eq("batch_id", batch.id);
  if (result.error) throw new Error(result.error.message);
  const rows = (result.data ?? []) as QueueRow[];
  const readyCount = rows.filter((row) => row.status === "ready").length;
  const failedRows = rows.filter((row) => row.status === "failed");
  const failedCount = failedRows.length;
  const activeCount = rows.filter(
    (row) => row.status === "batched" || row.status === "processing",
  ).length;
  const processedCount = readyCount + failedCount;
  const generatedAudioCount = rows.reduce(
    (total, row) => total + (row.generated_audio_count || 0),
    0,
  );
  const reusedAudioCount = rows.reduce(
    (total, row) => total + (row.reused_audio_count || 0),
    0,
  );
  const linkedAudioCount = rows.reduce(
    (total, row) => total + (row.linked_audio_count || 0),
    0,
  );
  const status: BatchRow["status"] =
    activeCount > 0
      ? "processing"
      : failedCount === 0
        ? "completed"
        : readyCount > 0
          ? "partial"
          : "failed";
  const terminal = status === "completed" || status === "partial" || status === "failed";
  const errorSummary = failedRows
    .map((row) => row.error_message)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3)
    .join(" | ")
    .slice(0, 1_000);

  const saved = await admin
    .from("lesson_tts_batches")
    .update({
      status,
      processed_count: processedCount,
      ready_count: readyCount,
      failed_count: failedCount,
      generated_audio_count: generatedAudioCount,
      reused_audio_count: reusedAudioCount,
      linked_audio_count: linkedAudioCount,
      completed_at: terminal ? new Date().toISOString() : null,
      error_message: errorSummary || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batch.id);
  if (saved.error) throw new Error(saved.error.message);

  return {
    batchId: batch.id,
    status,
    lessonCount: rows.length || batch.lesson_count,
    processedCount,
    readyCount,
    failedCount,
    generatedAudioCount,
    reusedAudioCount,
    linkedAudioCount,
  };
}

export async function processLessonTtsBatches(input: {
  batchId?: string;
} = {}): Promise<LessonTtsBatchResult | null> {
  const admin = adminClient();
  const batch = await loadBatch(admin, input.batchId);
  if (!batch) return null;

  await resetStaleClaims(admin, batch.id);
  if (batch.status === "queued") {
    const started = await admin
      .from("lesson_tts_batches")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id)
      .eq("status", "queued");
    if (started.error) throw new Error(started.error.message);
  }

  const pending = await admin
    .from("lesson_tts_queue")
    .select(
      "id,lesson_version_id,status,attempts,generated_audio_count,reused_audio_count,linked_audio_count,error_message",
    )
    .eq("batch_id", batch.id)
    .eq("status", "batched")
    .order("queued_at", { ascending: true });
  if (pending.error) throw new Error(pending.error.message);

  await inParallel((pending.data ?? []) as QueueRow[], (row) =>
    processItem(admin, row),
  );
  return summarizeBatch(admin, batch);
}
