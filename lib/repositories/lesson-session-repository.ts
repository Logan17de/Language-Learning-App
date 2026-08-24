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
  // Only one lesson is open at a time, so starting another closes this one and
  // its sections stop committing. Reopening the lesson makes it current again
  // and the queued section goes through, so this is a "come back" rather than
  // the "try again" it used to read as.
  if (
    message.includes("Active lesson session unavailable") ||
    message.includes("Only the current lesson section can be committed")
  ) {
    return "You moved on to another lesson, so this section is waiting. Reopen this lesson and it will save itself.";
  }
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
  /**
   * Open this lesson, and only this lesson.
   *
   * Resolved in one server statement rather than a read-then-write from the
   * browser: two browsers doing select-then-insert both saw no active session
   * and both made one, which is how a learner ended up holding thirteen. The
   * server resumes the session this lesson already has and closes any other, so
   * every browser gets the same answer.
   */
  async startOrResume(lessonId: string, lessonVersionId: string): Promise<RepositoryResult<LessonSession>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("start_or_resume_lesson_session", {
      p_lesson_id: lessonId,
      p_lesson_version_id: lessonVersionId,
    });
    if (error) return failure(error, "Your saved lesson could not be loaded.");
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return failure({}, "Your saved lesson could not be loaded.");
    }
    return success(data as unknown as LessonSession);
  },

  async saveCheckpoint(sessionId: string, checkpoint: Pick<LessonSession, "current_phase" | "current_phase_index" | "activity_index" | "elapsed_seconds" | "checkpoint">): Promise<RepositoryResult<LessonSession>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("lesson_sessions").update({
      ...checkpoint,
      last_saved_at: new Date().toISOString(),
      // Not `status = 'active'`. Opening another lesson closes this one, and a
      // browser still sitting on it could then save nothing at all — every
      // attempt matched zero rows and the learner was told to retry something
      // that could never succeed. A checkpoint is only the learner's place in
      // their own lesson, so writing it to a closed session is harmless and
      // keeps that place for when they come back to it. A finished lesson is
      // still off limits.
    }).eq("id", sessionId).neq("status", "completed").select("*").single();
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
