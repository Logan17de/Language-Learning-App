import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";

type Report = Database["public"]["Tables"]["lesson_reports"]["Row"];
type ReportInsert = Database["public"]["Tables"]["lesson_reports"]["Insert"];

export const reportRepository = {
  async listMine(): Promise<RepositoryResult<Report[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_reports").select("*").order("submitted_at", { ascending: false });
    return error ? failure(error, "Reports could not be loaded.") : success(data ?? []);
  },

  async submit(input: Omit<ReportInsert, "id" | "user_id" | "created_at" | "updated_at">): Promise<RepositoryResult<Report>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to submit a report.");
    const { data, error } = await client.from("lesson_reports").insert({ ...input, user_id: auth.user.id }).select("*").single();
    return error ? failure(error, "Your report could not be submitted.") : success(data);
  },

  async submitForLessonRef(input: {
    lessonRef: string; phase?: string; activityId?: string; category: string;
    description: string; userAnswer?: string; route: string;
  }): Promise<RepositoryResult<Report>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to submit a report.");
    const byId = await client.from("lessons").select("id,current_version_id").eq("id", input.lessonRef).maybeSingle();
    const lesson = byId.data ?? (await client.from("lessons").select("id,current_version_id").eq("legacy_id", input.lessonRef).maybeSingle()).data;
    if (!lesson) return failure({ code: "PGRST116" }, "The lesson record could not be found.");
    const { data, error } = await client.from("lesson_reports").insert({
      user_id: auth.user.id,
      lesson_id: lesson.id,
      lesson_version_id: lesson.current_version_id,
      phase: input.phase ?? null,
      activity_id: input.activityId ?? null,
      category: input.category,
      description: input.description,
      user_answer: input.userAnswer ?? null,
      route: input.route,
      priority: "medium",
      status: "new",
      submitted_at: new Date().toISOString(),
    }).select("*").single();
    return error ? failure(error, "Your report could not be submitted.") : success(data);
  },
};
