import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Database } from "@/types/database";

type Summary = Database["public"]["Views"]["admin_dashboard_summary"]["Row"];
type Audit = Database["public"]["Tables"]["audit_logs"]["Row"];
type Service = Database["public"]["Tables"]["service_status"]["Row"];
type Cost = Database["public"]["Tables"]["cost_records"]["Row"];
type Job = Database["public"]["Tables"]["generated_lesson_jobs"]["Row"];
type Validation = Database["public"]["Tables"]["lesson_validation_runs"]["Row"];
type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Completion = Database["public"]["Tables"]["lesson_completions"]["Row"];
type Activity = Database["public"]["Tables"]["weekly_activity"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Request = Database["public"]["Tables"]["custom_lesson_requests"]["Row"];

export interface AdminDashboardData {
  summary: Summary;
  recentAudit: Audit[];
  services: Service[];
  recentJobs: Job[];
  recentValidations: Validation[];
  lessons: Lesson[];
  completionsToday: Completion[];
  costsThisMonth: Cost[];
  imageCount: number;
  audioCount: number;
}

export interface AdminAnalyticsData {
  profiles: Profile[];
  activity: Activity[];
  completions: Completion[];
  requests: Request[];
  jobs: Job[];
  validations: Validation[];
  lessons: Lesson[];
  costs: Cost[];
}

export interface AdminCostData {
  costs: Cost[];
  jobs: Job[];
  lessons: Lesson[];
  imageCount: number;
  audioCount: number;
}

function dayStartIso(daysAgo = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

function dateOnly(daysAgo = 0): string {
  return dayStartIso(daysAgo).slice(0, 10);
}

function monthStart(): string {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString().slice(0, 10);
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

export const adminDashboardRepository = {
  async loadDashboard(): Promise<RepositoryResult<AdminDashboardData>> {
    const client = createClient();
    if (!client) return notConfigured();

    const [
      summary,
      audit,
      services,
      jobs,
      validations,
      lessons,
      completions,
      costs,
      imageCount,
      audioCount,
    ] = await Promise.all([
      client.from("admin_dashboard_summary").select("*").maybeSingle(),
      client
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12),
      client.from("service_status").select("*").order("service_name"),
      client
        .from("generated_lesson_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12),
      client
        .from("lesson_validation_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12),
      client
        .from("lessons")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(100),
      client
        .from("lesson_completions")
        .select("*")
        .gte("completed_at", dayStartIso())
        .order("completed_at", { ascending: false }),
      client
        .from("cost_records")
        .select("*")
        .gte("record_date", monthStart())
        .order("record_date", { ascending: false }),
      client
        .from("image_assets")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null),
      client
        .from("audio_assets")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null),
    ]);
    const error = firstError([
      summary,
      audit,
      services,
      jobs,
      validations,
      lessons,
      completions,
      costs,
      imageCount,
      audioCount,
    ]);
    if (error) return failure(error, "Admin telemetry could not be loaded.");

    return success({
      summary: summary.data ?? {
        total_users: 0,
        daily_active_users: 0,
        premium_users: 0,
        published_lessons: 0,
        pending_validations: 0,
        open_reports: 0,
        open_support_tickets: 0,
      },
      recentAudit: audit.data ?? [],
      services: services.data ?? [],
      recentJobs: jobs.data ?? [],
      recentValidations: validations.data ?? [],
      lessons: lessons.data ?? [],
      completionsToday: completions.data ?? [],
      costsThisMonth: costs.data ?? [],
      imageCount: imageCount.count ?? 0,
      audioCount: audioCount.count ?? 0,
    });
  },

  async loadAnalytics(days = 30): Promise<RepositoryResult<AdminAnalyticsData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const sinceDate = dateOnly(Math.max(1, days) - 1);
    const sinceIso = dayStartIso(Math.max(1, days) - 1);

    const [
      profiles,
      activity,
      completions,
      requests,
      jobs,
      validations,
      lessons,
      costs,
    ] = await Promise.all([
      client.from("profiles").select("*").order("created_at"),
      client
        .from("weekly_activity")
        .select("*")
        .gte("activity_date", sinceDate)
        .order("activity_date"),
      client
        .from("lesson_completions")
        .select("*")
        .gte("completed_at", sinceIso)
        .order("completed_at"),
      client
        .from("custom_lesson_requests")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at"),
      client
        .from("generated_lesson_jobs")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at"),
      client
        .from("lesson_validation_runs")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at"),
      client.from("lessons").select("*").order("created_at"),
      client
        .from("cost_records")
        .select("*")
        .gte("record_date", sinceDate)
        .order("record_date"),
    ]);
    const error = firstError([
      profiles,
      activity,
      completions,
      requests,
      jobs,
      validations,
      lessons,
      costs,
    ]);
    if (error) return failure(error, "Admin analytics could not be loaded.");

    return success({
      profiles: profiles.data ?? [],
      activity: activity.data ?? [],
      completions: completions.data ?? [],
      requests: requests.data ?? [],
      jobs: jobs.data ?? [],
      validations: validations.data ?? [],
      lessons: lessons.data ?? [],
      costs: costs.data ?? [],
    });
  },

  async loadCosts(days = 31): Promise<RepositoryResult<AdminCostData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const sinceDate = dateOnly(Math.max(1, days) - 1);
    const sinceIso = dayStartIso(Math.max(1, days) - 1);
    const [costs, jobs, lessons, imageCount, audioCount] = await Promise.all([
      client
        .from("cost_records")
        .select("*")
        .gte("record_date", sinceDate)
        .order("record_date", { ascending: false }),
      client
        .from("generated_lesson_jobs")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false }),
      client
        .from("lessons")
        .select("*")
        .order("updated_at", { ascending: false }),
      client
        .from("image_assets")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null),
      client
        .from("audio_assets")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null),
    ]);
    const error = firstError([costs, jobs, lessons, imageCount, audioCount]);
    if (error) return failure(error, "Admin cost data could not be loaded.");
    return success({
      costs: costs.data ?? [],
      jobs: jobs.data ?? [],
      lessons: lessons.data ?? [],
      imageCount: imageCount.count ?? 0,
      audioCount: audioCount.count ?? 0,
    });
  },
};
