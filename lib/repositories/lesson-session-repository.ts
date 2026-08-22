import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import { isMissingPhaseAtomicRpc } from "@/lib/sync/phase-rpc-compatibility";
import type { Database, Json } from "@/types/database";
import type { LessonPhaseId } from "@/types/lesson-session";
import { isUuid } from "@/lib/identifiers";

type LessonSession = Database["public"]["Tables"]["lesson_sessions"]["Row"];
type LessonAnswer = Database["public"]["Tables"]["lesson_activity_answers"]["Insert"];
type LessonCompletion = Database["public"]["Tables"]["lesson_completions"]["Row"];

export interface LessonCompletionInput {
  sessionId: string;
  score: number;
  /** Legacy client field accepted during rollout; the server ignores it. */
  xp?: number;
  durationMinutes: number;
  completionData: Json;
}

function lessonProgressError(error: unknown, fallback: string): string {
  const message =
    error && typeof error === "object" && "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";
  if (message.includes("Premium Grammar requires exactly 5 validated translations")) {
    return "Grammar is missing its 5 validated translations. Restart the Grammar section, then complete it again.";
  }
  if (message.includes("Vocabulary") && message.includes("7")) {
    return "Vocabulary is missing one or more of its 7 answers. Finish the section or skip it.";
  }
  if (message.includes("Grammar") && message.includes("7")) {
    return "Grammar is missing one or more of its 7 answers. Finish the section or skip it.";
  }
  if (message.includes("Reading") && message.includes("5")) {
    return "Reading is missing one or more of its 5 answers. Finish the section or skip it.";
  }
  if (message.includes("Listening") && message.includes("5")) {
    return "Listening is missing one or more of its 5 answers. Finish the section or skip it.";
  }
  if (message.includes("Speaking") && message.includes("5")) {
    return "Speaking is missing one or more of its 5 checked recordings. Finish the section or skip it.";
  }
  if (message.includes("Previous lesson phase is not committed")) {
    return "The previous section has not been saved yet. Return to it and try again.";
  }
  return fallback;
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

    const byId = isUuid(lessonReference)
      ? await client
          .from("lessons")
          .select("id")
          .eq("id", lessonReference)
          .maybeSingle()
      : null;
    if (byId?.error) {
      return failure(byId.error, "The lesson could not be identified.");
    }
    const lessonResult = byId?.data
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
    // Answers are insert-once. An answered question is final, so a repeated
    // sync of the same answer must be a harmless no-op and a different second
    // answer must never replace the first. ignoreDuplicates resolves the
    // conflict with DO NOTHING rather than DO UPDATE, which also means this
    // path needs no UPDATE privilege on the table.
    const { error } = await client.from("lesson_activity_answers").upsert(records, { onConflict: "lesson_session_id,phase,activity_id", ignoreDuplicates: true });
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

  /**
   * Returns null only when commit_lesson_phase itself is absent from the
   * pre-migration database. Validation/auth failures remain hard failures.
   */
  async commitPhase(
    sessionId: string,
    phase: LessonPhaseId,
  ): Promise<RepositoryResult<Json | null>> {
    const client = createClient();
    if (!client) return notConfigured();
    // These RPCs intentionally lead the generated Database type during the
    // coordinated rollout. Keep the escape hatch scoped to the pending calls.
    const rawClient = client as unknown as SupabaseClient;
    const { data, error } = await rawClient.rpc("commit_lesson_phase", {
      p_session_id: sessionId,
      p_phase: phase,
    });
    if (error && isMissingPhaseAtomicRpc(error, "commit_lesson_phase")) {
      return success(null);
    }
    return error
      ? failure(
          error,
          lessonProgressError(error, "This phase could not be committed. Please try again."),
        )
      : success((data ?? null) as Json | null);
  },

  async skipPhase(
    sessionId: string,
    phase: LessonPhaseId,
  ): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    const rawClient = client as unknown as SupabaseClient;
    const { data, error } = await rawClient.rpc("skip_lesson_phase", {
      p_session_id: sessionId,
      p_phase: phase,
    });
    return error
      ? failure(
          error,
          lessonProgressError(error, "This section could not be skipped. Please try again."),
        )
      : success((data ?? {}) as Json);
  },

  async recordLegacyMasteryEvidence(
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

  /** Null means only that reset_incomplete_lesson_phase is not deployed yet. */
  async resetIncompletePhase(sessionId: string): Promise<RepositoryResult<Json | null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const rawClient = client as unknown as SupabaseClient;
    const { data, error } = await rawClient.rpc("reset_incomplete_lesson_phase", {
      p_session_id: sessionId,
    });
    if (error && isMissingPhaseAtomicRpc(error, "reset_incomplete_lesson_phase")) {
      return success(null);
    }
    return error
      ? failure(error, "Your saved lesson could not be restored safely.")
      : success((data ?? null) as Json | null);
  },

  async latestCompletion(lessonId: string): Promise<RepositoryResult<LessonCompletion | null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client
      .from("lesson_completions")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return error
      ? failure(error, "Your lesson result could not be loaded.")
      : success(data ?? null);
  },

  async complete(input: LessonCompletionInput): Promise<RepositoryResult<Json>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("complete_lesson_session", {
      p_session_id: input.sessionId,
      p_score: input.score,
      // Kept only for compatibility with the existing RPC signature. The server
      // calculates canonical XP and deliberately ignores this placeholder.
      p_xp: 0,
      p_duration_minutes: input.durationMinutes,
      p_completion_data: input.completionData,
    });
    return error
      ? failure(
          error,
          lessonProgressError(error, "Lesson completion is waiting to sync."),
        )
      : success(data);
  },
};
