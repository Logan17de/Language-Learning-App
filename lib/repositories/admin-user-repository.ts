import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";

type Completion = Database["public"]["Tables"]["lesson_completions"]["Row"];
type Review = Database["public"]["Tables"]["review_results"]["Row"];
type Request = Database["public"]["Tables"]["custom_lesson_requests"]["Row"];
type Report = Database["public"]["Tables"]["lesson_reports"]["Row"];
type Ticket = Database["public"]["Tables"]["support_tickets"]["Row"];
type Audit = Database["public"]["Tables"]["audit_logs"]["Row"];
type Mastery = Database["public"]["Tables"]["learner_mastery"]["Row"];
type Activity = Database["public"]["Tables"]["weekly_activity"]["Row"];
type Subscription = Database["public"]["Tables"]["user_subscriptions"]["Row"];
type Preferences = Database["public"]["Tables"]["user_preferences"]["Row"];
type Settings = Database["public"]["Tables"]["user_settings"]["Row"];

export interface AdminUserListItem {
  profile: ProfileRow;
  lessonsCompleted: number;
  supportRequestCount: number;
  reportCount: number;
  lastActive: string | null;
}

export interface AdminUserDetailData {
  profile: ProfileRow;
  preferences: Preferences | null;
  settings: Settings | null;
  subscriptions: Subscription[];
  completions: Completion[];
  reviews: Review[];
  customRequests: Request[];
  reports: Report[];
  tickets: Ticket[];
  audit: Audit[];
  mastery: Mastery[];
  activity: Activity[];
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

export const adminUserRepository = {
  async list(): Promise<RepositoryResult<ProfileRow[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    return error ? failure(error, "Users could not be loaded.") : success(data ?? []);
  },

  async listWithStats(): Promise<RepositoryResult<AdminUserListItem[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [profiles, completions, reports, tickets, activity] = await Promise.all([
      client.from("profiles").select("*").order("created_at", { ascending: false }),
      client.from("lesson_completions").select("user_id,completed_at"),
      client.from("lesson_reports").select("user_id"),
      client.from("support_tickets").select("user_id"),
      client.from("weekly_activity").select("user_id,activity_date,minutes").gte("activity_date", since).order("activity_date", { ascending: false }),
    ]);
    const error = firstError([profiles, completions, reports, tickets, activity]);
    if (error) return failure(error, "User operations data could not be loaded.");

    const completionCount = new Map<string, number>();
    for (const item of completions.data ?? []) completionCount.set(item.user_id, (completionCount.get(item.user_id) ?? 0) + 1);
    const reportCount = new Map<string, number>();
    for (const item of reports.data ?? []) reportCount.set(item.user_id, (reportCount.get(item.user_id) ?? 0) + 1);
    const ticketCount = new Map<string, number>();
    for (const item of tickets.data ?? []) ticketCount.set(item.user_id, (ticketCount.get(item.user_id) ?? 0) + 1);
    const lastActive = new Map<string, string>();
    for (const item of activity.data ?? []) {
      if (item.minutes <= 0 || lastActive.has(item.user_id)) continue;
      lastActive.set(item.user_id, item.activity_date);
    }

    return success((profiles.data ?? []).map((profile) => ({
      profile,
      lessonsCompleted: completionCount.get(profile.id) ?? 0,
      supportRequestCount: ticketCount.get(profile.id) ?? 0,
      reportCount: reportCount.get(profile.id) ?? 0,
      lastActive: lastActive.get(profile.id) ?? null,
    })));
  },

  async getDetail(userId: string): Promise<RepositoryResult<AdminUserDetailData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const [profile, preferences, settings, subscriptions, completions, reviews, requests, reports, tickets, audit, mastery, activity] = await Promise.all([
      client.from("profiles").select("*").eq("id", userId).single(),
      client.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
      client.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
      client.from("user_subscriptions").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      client.from("lesson_completions").select("*").eq("user_id", userId).order("completed_at", { ascending: false }).limit(100),
      client.from("review_results").select("*").eq("user_id", userId).order("completed_at", { ascending: false }).limit(100),
      client.from("custom_lesson_requests").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      client.from("lesson_reports").select("*").eq("user_id", userId).order("submitted_at", { ascending: false }).limit(100),
      client.from("support_tickets").select("*").eq("user_id", userId).order("last_message_at", { ascending: false }).limit(100),
      client.from("audit_logs").select("*").eq("entity_id", userId).order("created_at", { ascending: false }).limit(100),
      client.from("learner_mastery").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1000),
      client.from("weekly_activity").select("*").eq("user_id", userId).order("activity_date", { ascending: false }).limit(90),
    ]);
    const error = firstError([profile, preferences, settings, subscriptions, completions, reviews, requests, reports, tickets, audit, mastery, activity]);
    if (error) return failure(error, "User detail could not be loaded.");
    if (!profile.data) return failure({ code: "PGRST116" }, "User not found.");

    return success({
      profile: profile.data,
      preferences: preferences.data,
      settings: settings.data,
      subscriptions: subscriptions.data ?? [],
      completions: completions.data ?? [],
      reviews: reviews.data ?? [],
      customRequests: requests.data ?? [],
      reports: reports.data ?? [],
      tickets: tickets.data ?? [],
      audit: audit.data ?? [],
      mastery: mastery.data ?? [],
      activity: activity.data ?? [],
    });
  },

  async setStatus(
    userId: string,
    status: Database["public"]["Enums"]["account_status"],
  ): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client
      .from("profiles")
      .update({ status })
      .eq("id", userId)
      .select("*")
      .single();
    return error
      ? failure(error, "The account status could not be updated.")
      : success(data);
  },
};
