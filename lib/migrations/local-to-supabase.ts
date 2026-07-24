"use client";

import { createClient } from "@/lib/supabase/client";
import { parseLegacyState } from "@/lib/migrations/migration-validation";
import type { LegacyImportPreview, LegacyImportReport } from "@/lib/migrations/migration-types";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";

function numeric(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function findLegacyImport(): LegacyImportPreview | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("aiko-app-state") ?? window.localStorage.getItem("kizuna-app-state");
    return raw ? parseLegacyState(raw) : null;
  } catch {
    return null;
  }
}

export async function shouldOfferLegacyImport(): Promise<boolean> {
  const client = createClient();
  if (!client) return false;
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return false;
  const { data } = await client.from("profiles").select("legacy_imported_at").eq("id", auth.user.id).maybeSingle();
  return Boolean(data && !data.legacy_imported_at);
}

export async function importLegacyData(preview: LegacyImportPreview): Promise<RepositoryResult<LegacyImportReport>> {
  const client = createClient();
  if (!client) return notConfigured();
  const { data, error } = await client.rpc("import_legacy_progress", { p_payload: preview.payload });
  if (error) return failure(error, "Your saved progress could not be imported.");
  const report = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
  return success({
    alreadyImported: report.already_imported === true,
    lessons: numeric(report.lessons),
    mastery: numeric(report.mastery),
    queue: numeric(report.queue),
    achievements: numeric(report.achievements),
    skipped: preview.summary.skippedRecords + preview.summary.customLessons,
  });
}
