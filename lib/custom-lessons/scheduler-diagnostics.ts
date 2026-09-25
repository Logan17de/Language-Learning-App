import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export interface CustomLessonSchedulerDiagnostics {
  ready: boolean;
  jobName: string;
  jobActive: boolean;
  schedule: string | null;
  workerUrlConfigured: boolean;
  workerSecretConfigured: boolean;
  lastRunStatus: string | null;
  lastRunFinishedAt: string | null;
  detail: string;
  checkedAt: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDiagnostics(value: Json): CustomLessonSchedulerDiagnostics {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Custom lesson scheduler diagnostics returned an invalid payload.");
  }
  return {
    ready: value.ready === true,
    jobName: text(value.job_name) ?? "custom-lesson-worker-every-minute",
    jobActive: value.job_active === true,
    schedule: text(value.schedule),
    workerUrlConfigured: value.worker_url_configured === true,
    workerSecretConfigured: value.worker_secret_configured === true,
    lastRunStatus: text(value.last_run_status),
    lastRunFinishedAt: text(value.last_run_finished_at),
    detail: text(value.detail) ?? "Scheduler readiness could not be determined.",
    checkedAt: text(value.checked_at),
  };
}

export async function getCustomLessonSchedulerDiagnostics(): Promise<CustomLessonSchedulerDiagnostics> {
  const admin = createAdminClient();
  const result = await admin.rpc("custom_lesson_scheduler_diagnostics");
  if (result.error) throw new Error(result.error.message);
  return parseDiagnostics(result.data);
}
