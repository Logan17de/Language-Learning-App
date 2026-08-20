import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { JLPTLevel } from "@/types/lesson";

export type CurrentLessonState =
  | "building"
  | "ready"
  | "active"
  | "completed"
  | null;

export interface LessonCreationState {
  plan: "free" | "premium";
  localDate: string;
  timezone: string;
  canCreate: boolean;
  dailyLimit: number;
  creationsToday: number;
  /** Today's creation/request state. Kept separate from the resumable lesson. */
  requestId: string | null;
  requestStatus: string | null;
  topic: string | null;
  level: JLPTLevel | null;
  lessonId: string | null;
  lessonState: CurrentLessonState;
  entitlementConsumed: boolean;
  /** Latest unfinished playable lesson, independent of today's quota date. */
  resumeRequestId: string | null;
  resumeTopic: string | null;
  resumeLevel: JLPTLevel | null;
  resumeLessonId: string | null;
  resumeLessonState: Extract<CurrentLessonState, "ready" | "active">;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function level(value: unknown): JLPTLevel | null {
  const candidate = text(value);
  return candidate === "N5" ||
    candidate === "N4" ||
    candidate === "N3" ||
    candidate === "N2" ||
    candidate === "N1"
    ? candidate
    : null;
}

function lessonState(value: unknown): CurrentLessonState {
  const candidate = text(value);
  return candidate === "building" ||
    candidate === "ready" ||
    candidate === "active" ||
    candidate === "completed"
    ? candidate
    : null;
}

function parseState(value: unknown): LessonCreationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const plan = row.plan;
  if (plan !== "free" && plan !== "premium") return null;

  // New DB versions return explicit today_* and resume_* fields. The aliases
  // keep the frontend safe while it is promoted ahead of the DB migration.
  const currentLessonState = lessonState(
    row.today_lesson_state ?? row.lesson_state,
  );
  const currentRequestId = text(row.today_request_id ?? row.request_id);
  const currentTopic = text(row.today_topic ?? row.topic);
  const currentLevel = level(row.today_level ?? row.level);
  const currentLessonId = text(row.today_lesson_id ?? row.lesson_id);

  const explicitResumeState = lessonState(row.resume_lesson_state);
  const legacyActiveFallback =
    !text(row.resume_lesson_id) && currentLessonState === "active";
  const resumeState = explicitResumeState === "ready" || explicitResumeState === "active"
    ? explicitResumeState
    : legacyActiveFallback
      ? "active"
      : null;

  return {
    plan,
    localDate: text(row.local_date) ?? "",
    timezone: text(row.quota_timezone ?? row.timezone) ?? "UTC",
    canCreate: row.can_create === true,
    dailyLimit: integer(row.daily_limit),
    creationsToday: integer(row.creations_today),
    requestId: currentRequestId,
    requestStatus: text(row.today_request_status ?? row.request_status),
    topic: currentTopic,
    level: currentLevel,
    lessonId: currentLessonId,
    lessonState: currentLessonState,
    entitlementConsumed:
      (row.today_entitlement_consumed ?? row.entitlement_consumed) === true,
    resumeRequestId: text(row.resume_request_id) ??
      (legacyActiveFallback ? currentRequestId : null),
    resumeTopic: text(row.resume_topic) ??
      (legacyActiveFallback ? currentTopic : null),
    resumeLevel: level(row.resume_level) ??
      (legacyActiveFallback ? currentLevel : null),
    resumeLessonId: text(row.resume_lesson_id) ??
      (legacyActiveFallback ? currentLessonId : null),
    resumeLessonState: resumeState,
  };
}

export const lessonCreationRepository = {
  async load(): Promise<RepositoryResult<LessonCreationState>> {
    const client = createClient();
    if (!client) return notConfigured();
    const rawClient = client as unknown as SupabaseClient;
    const { data, error } = await rawClient.rpc("get_lesson_creation_state");
    if (error) {
      return failure(error, "Your lesson allowance could not be loaded.");
    }
    const state = parseState(data);
    return state
      ? success(state)
      : failure({ code: "PGRST116" }, "Your lesson allowance could not be loaded.");
  },
};
