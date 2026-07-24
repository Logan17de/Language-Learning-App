import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database, Json } from "@/types/database";
import type { LessonPackage } from "@/types/lesson";

type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type LessonVersion = Database["public"]["Tables"]["lesson_versions"]["Row"];

export const adminLessonRepository = {
  async list(): Promise<RepositoryResult<Lesson[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lessons").select("*").order("updated_at", { ascending: false });
    return error ? failure(error, "Admin lessons could not be loaded.") : success(data ?? []);
  },

  async listVersions(): Promise<RepositoryResult<LessonVersion[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_versions").select("*").order("version_number", { ascending: false });
    return error ? failure(error, "Lesson versions could not be loaded.") : success(data ?? []);
  },

  async update(lessonId: string, values: Database["public"]["Tables"]["lessons"]["Update"]): Promise<RepositoryResult<Lesson>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lessons").update(values).eq("id", lessonId).select("*").single();
    return error ? failure(error, "The lesson could not be updated.") : success(data);
  },

  async publish(lessonId: string, changeSummary: string): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("publish_lesson_version", { p_lesson_id: lessonId, p_change_summary: changeSummary });
    return error ? failure(error, "The lesson could not be published.") : success(data);
  },

  async saveDraft(lesson: LessonPackage): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("save_lesson_draft", {
      p_lesson_ref: lesson.id,
      p_package: JSON.parse(JSON.stringify(lesson)) as Json,
    });
    return error ? failure(error, "The lesson draft could not be saved.") : success(data);
  },
};
