import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";
import type { ReviewActivityAnswer } from "@/types/review-session";

type QueueItem = Database["public"]["Tables"]["review_queue"]["Row"];
type ReviewSession = Database["public"]["Tables"]["review_sessions"]["Row"];

export const reviewRepository = {
  async listDue(): Promise<RepositoryResult<QueueItem[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("review_queue").select("*").lte("due_at", new Date().toISOString()).eq("status", "due").order("due_at");
    return error ? failure(error, "Review items could not be loaded.") : success(data ?? []);
  },

  async start(): Promise<RepositoryResult<ReviewSession>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Please sign in to start a review.");
    const existing = await client.from("review_sessions").select("*").eq("user_id", auth.user.id).eq("status", "active").maybeSingle();
    if (existing.data) return success(existing.data);
    const { data, error } = await client.from("review_sessions").insert({
      user_id: auth.user.id,
      status: "active",
      started_at: new Date().toISOString(),
      xp_awarded: 0,
    }).select("*").single();
    if (error?.code === "23505") {
      const resumed = await client.from("review_sessions").select("*").eq("user_id", auth.user.id).eq("status", "active").single();
      if (!resumed.error) return success(resumed.data);
    }
    return error ? failure(error, "Review could not be started.") : success(data);
  },

  async saveAnswers(sessionId: string, answers: ReviewActivityAnswer[]): Promise<RepositoryResult<number>> {
    const client = createClient();
    if (!client) return notConfigured();
    if (!answers.length) return success(0);
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const records = answers.map((answer) => ({
      user_id: auth.user!.id,
      review_session_id: sessionId,
      review_queue_id: answer.queueItemId,
      activity_id: answer.activityId,
      activity_type: "deterministic",
      selected_answer: answer.selectedAnswer,
      correct: answer.correct,
      answer_data: { queue_item_key: answer.queueItemId },
    }));
    const { error } = await client.from("review_activity_answers").upsert(records, { onConflict: "review_session_id,activity_id" });
    return error ? failure(error, "Review answers are waiting to sync.") : success(records.length);
  },

  async complete(input: {
    sessionId: string; score: number; correctCount: number; totalCount: number;
    improvedItemIds: string[]; weakItemIds: string[]; xp: number;
  }): Promise<RepositoryResult<Database["public"]["Functions"]["complete_review_session"]["Returns"]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("complete_review_session", {
      p_session_id: input.sessionId,
      p_score: input.score,
      p_correct_count: input.correctCount,
      p_total_count: input.totalCount,
      p_improved_item_ids: input.improvedItemIds,
      p_weak_item_ids: input.weakItemIds,
      p_xp: input.xp,
    });
    return error ? failure(error, "Review completion is waiting to sync.") : success(data);
  },
};
