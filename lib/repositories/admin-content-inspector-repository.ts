import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";

export interface CurriculumInspectorData {
  levels: Database["public"]["Tables"]["curriculum_levels"]["Row"][];
  items: Database["public"]["Tables"]["curriculum_items"]["Row"][];
  lessons: Database["public"]["Tables"]["lessons"]["Row"][];
}

export const adminContentInspectorRepository = {
  async loadCurriculum(): Promise<RepositoryResult<CurriculumInspectorData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const [levels, items, lessons] = await Promise.all([
      client.from("curriculum_levels").select("*").order("sequence_order"),
      client.from("curriculum_items").select("*").order("sequence_order"),
      client.from("lessons").select("*").order("updated_at", { ascending: false }),
    ]);
    const error = levels.error || items.error || lessons.error;
    if (error) return failure(error, "Curriculum data could not be loaded.");
    return success({ levels: levels.data ?? [], items: items.data ?? [], lessons: lessons.data ?? [] });
  },
};
