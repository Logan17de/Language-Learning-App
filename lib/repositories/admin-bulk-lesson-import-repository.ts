import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Json } from "@/types/database";

export interface BulkLessonImportResult {
  count: number;
  results: Json[];
}

function normalizeResult(value: unknown): BulkLessonImportResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { count: 0, results: [] };
  }
  const record = value as Record<string, unknown>;
  return {
    count: typeof record.count === "number" ? record.count : 0,
    results: Array.isArray(record.results) ? record.results as Json[] : [],
  };
}

export const adminBulkLessonImportRepository = {
  async importMany(
    lessons: unknown[],
    publish: boolean,
  ): Promise<RepositoryResult<BulkLessonImportResult>> {
    const client = createClient();
    if (!client) return notConfigured();
    const rawClient = client as unknown as SupabaseClient;
    const { data, error } = await rawClient.rpc("import_complete_lessons", {
      p_packages: lessons as Json,
      p_publish: publish,
    });
    return error
      ? failure(error, "The lesson upload could not be imported.")
      : success(normalizeResult(data));
  },
};
