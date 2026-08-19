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
  requestId: string | null;
  requestStatus: string | null;
  topic: string | null;
  level: JLPTLevel | null;
  lessonId: string | null;
  lessonState: CurrentLessonState;
  entitlementConsumed: boolean;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0;
}

function parseState(value: unknown): LessonCreationState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const plan = row.plan;
  if (plan !== "free" && plan !== "premium") return null;

  const level = text(row.level);
  const rawLessonState = text(row.lesson_state);
  const lessonState: CurrentLessonState =
    rawLessonState === "building" ||
    rawLessonState === "ready" ||
    rawLessonState === "active" ||
    rawLessonState === "completed"
      ? rawLessonState
      : null;
  return {
    plan,
    localDate: text(row.local_date) ?? "",
    timezone: text(row.timezone) ?? "UTC",
    canCreate: row.can_create === true,
    dailyLimit: integer(row.daily_limit),
    creationsToday: integer(row.creations_today),
    requestId: text(row.request_id),
    requestStatus: text(row.request_status),
    topic: text(row.topic),
    level:
      level === "N5" ||
      level === "N4" ||
      level === "N3" ||
      level === "N2" ||
      level === "N1"
        ? level
        : null,
    lessonId: text(row.lesson_id),
    lessonState,
    entitlementConsumed: row.entitlement_consumed === true,
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
