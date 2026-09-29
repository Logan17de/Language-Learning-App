import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database, Json } from "@/types/database";

type LessonSession = Database["public"]["Tables"]["lesson_sessions"]["Row"];
type LessonAnswer = Database["public"]["Tables"]["lesson_activity_answers"]["Insert"];

export interface LessonCompletionInput {
  sessionId: string;
  score: number;
  xp: number;
  durationMinutes: number;
  completionData: Json;
}

export const lessonSessionRepository = {
  async startOrResume(lessonId: string, lessonVersionId: string): Promise<RepositoryResult<LessonSession>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to start this lesson.");
    const existing = await client.from("lesson_sessions").select("*")
      .eq("user_id", auth.user.id).eq("lesson_id", lessonId).eq("status", "active")
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (existing.error) return failure(existing.error, "Your saved lesson could not be loaded.");
    if (existing.data) return success(existing.data);
    const { data, error } = await client.from("lesson_sessions").insert({
      user_id: auth.user.id,
      lesson_id: lessonId,
      lesson_version_id: lessonVersionId,
      status: "active",
      current_phase: "story",
      current_phase_index: 0,
      activity_index: 0,
      elapsed_seconds: 0,
      checkpoint: {},
      started_at: new Date().toISOString(),
      last_saved_at: new Date().toISOString(),
    }).select("*").single();
    if (error?.code === "23505") {
      const resumed = await client.from("lesson_sessions").select("*")
        .eq("user_id", auth.user.id).eq("lesson_version_id", lessonVersionId).eq("status", "active").single();
      if (!resumed.error) return success(resumed.data);
    }
    return error ? failure(error, "The lesson could not be started.") : success(data);
  },

  async saveCheckpoint(sessionId: string, checkpoint: Pick<LessonSession, "current_phase" | "current_phase_index" | "activity_index" | "elapsed_seconds" | "checkpoint">): Promise<RepositoryResult<LessonSession>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_sessions").update({
      ...checkpoint,
      last_saved_at: new Date().toISOString(),
    }).eq("id", sessionId).eq("status", "active").select("*").single();
    return error ? failure(error, "Your lesson checkpoint is waiting to sync.") : success(data);
  },

  async abandonActive(lessonReference: string): Promise<RepositoryResult<number>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");

    const byId = await client
      .from("lessons")
      .select("id")
      .eq("id", lessonReference)
      .maybeSingle();
    if (byId.error) {
      return failure(byId.error, "The lesson could not be identified.");
    }
    const lessonResult = byId.data
      ? byId
      : await client
          .from("lessons")
          .select("id")
          .eq("legacy_id", lessonReference)
          .maybeSingle();
    if (lessonResult.error) {
      return failure(lessonResult.error, "The lesson could not be identified.");
    }
    if (!lessonResult.data) {
      return failure({ code: "PGRST116" }, "The lesson could not be identified.");
    }

    const { data, error } = await client
      .from("lesson_sessions")
      .update({
        status: "abandoned",
        last_saved_at: new Date().toISOString(),
      })
      .eq("user_id", auth.user.id)
      .eq("lesson_id", lessonResult.data.id)
      .eq("status", "active")
      .select("id");
    return error
      ? failure(error, "The lesson could not be ended. Please try again.")
      : success(data?.length ?? 0);
  },

  async saveAnswers(answers: LessonAnswer[]): Promise<RepositoryResult<number>> {
    const client = createClient();
    if (!client) return notConfigured();
    if (!answers.length) return success(0);
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const records = answers.map((answer) => ({ ...answer, user_id: auth.user!.id }));
    const { error } = await client.from("lesson_activity_answers").upsert(records, { onConflict: "lesson_session_id,phase,activity_id" });
    return error ? failure(error, "Your answers are waiting to sync.") : success(answers.length);
  },

  async saveEvents(events: Database["public"]["Tables"]["lesson_events"]["Insert"][]): Promise<RepositoryResult<number>> {
    const client = createClient();
    if (!client) return notConfigured();
    if (!events.length) return success(0);
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const records = events.map((event) => ({ ...event, user_id: auth.user!.id }));
    const { error } = await client.from("lesson_events").upsert(records, { onConflict: "lesson_session_id,client_event_id", ignoreDuplicates: true });
    return error ? failure(error, "Your learning events are waiting to sync.") : success(events.length);
  },

  async recordMasteryEvidence(
    sessionId: string,
    events: Json[],
  ): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    if (!events.length) return success({ processed: 0 });
    const { data, error } = await client.rpc("record_mastery_evidence", {
      p_session_id: sessionId,
      p_events: events,
    });
    return error
      ? failure(error, "Your learning scores are waiting to sync.")
      : success(data);
  },

  async complete(input: LessonCompletionInput): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("complete_lesson_session", {
      p_session_id: input.sessionId,
      p_score: input.score,
      p_xp: input.xp,
      p_duration_minutes: input.durationMinutes,
      p_completion_data: input.completionData,
    });
    return error ? failure(error, "Lesson completion is waiting to sync.") : success(data);
  },
};
