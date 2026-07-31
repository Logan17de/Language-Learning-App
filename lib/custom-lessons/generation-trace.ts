import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export interface GenerationTraceContext {
  requestId?: string;
  stage?: string;
  group?: string;
  requestIndex?: number;
  itemNumber?: number;
  repairAttempt?: number;
  [key: string]: unknown;
}

export type GenerationTraceEventType =
  | "initial_response"
  | "repair_response"
  | "transport_retry"
  | "generation_failed";

interface SaveGenerationTraceInput {
  trace?: GenerationTraceContext;
  name: string;
  eventType: GenerationTraceEventType;
  attempt: number;
  model?: string;
  prompt?: string;
  rawResponse?: string;
  response?: unknown;
  issues?: string[];
  metadata?: Record<string, unknown>;
}

function enabled(): boolean {
  return process.env.CUSTOM_LESSON_GENERATION_TRACES !== "false";
}

function jsonValue(value: unknown): Json | null {
  if (value === undefined) return null;
  return value as Json;
}

/**
 * Trace writes are deliberately non-blocking for lesson correctness. A missing
 * migration or temporary database failure is logged, but it never causes the
 * learner's generation request to fail.
 */
export async function saveGenerationTrace(
  input: SaveGenerationTraceInput,
): Promise<void> {
  const requestId = input.trace?.requestId;
  if (!enabled() || typeof requestId !== "string" || requestId.length < 1) {
    return;
  }

  const { requestId: _requestId, stage, ...traceMetadata } = input.trace ?? {};
  const admin = createAdminClient() as unknown as SupabaseClient;
  const saved = await admin.from("custom_lesson_generation_traces").insert({
    request_id: requestId,
    stage: typeof stage === "string" && stage.length > 0 ? stage : input.name,
    event_type: input.eventType,
    attempt: Math.max(1, Math.round(input.attempt)),
    model: input.model ?? null,
    prompt: input.prompt ?? null,
    raw_response: input.rawResponse ?? null,
    response: jsonValue(input.response),
    issues: input.issues ?? [],
    metadata: {
      name: input.name,
      ...traceMetadata,
      ...(input.metadata ?? {}),
    } as unknown as Json,
  });

  if (saved.error) {
    console.warn("Custom lesson generation trace could not be saved.", {
      requestId,
      name: input.name,
      eventType: input.eventType,
      message: saved.error.message,
    });
  }
}
