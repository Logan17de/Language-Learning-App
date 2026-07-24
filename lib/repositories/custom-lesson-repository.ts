import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { CustomLessonRequest } from "@/types/app-preferences";
import type { Database } from "@/types/database";

type RequestRow = Database["public"]["Tables"]["custom_lesson_requests"]["Row"];

export const customLessonRepository = {
  async create(request: CustomLessonRequest): Promise<RepositoryResult<RequestRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to request a custom lesson.");
    let matchedLessonId: string | null = null;
    if (request.matchedLessonId) {
      const result = await client.from("lessons").select("id").eq("legacy_id", request.matchedLessonId).maybeSingle();
      matchedLessonId = result.data?.id ?? null;
    }
    const status = request.outcome === "existing" ? "matched" : "generation_pending";
    const { data, error } = await client.from("custom_lesson_requests").insert({
      user_id: auth.user.id,
      topic: request.topic,
      jlpt_level: request.level,
      duration_minutes: request.durationMinutes,
      focus: request.focus,
      speaking_difficulty: request.speakingDifficulty,
      note: request.note,
      status,
      matched_lesson_id: matchedLessonId,
    }).select("*").single();
    return error ? failure(error, "Your custom lesson request could not be saved.") : success(data);
  },
};
