import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";

type Job = Database["public"]["Tables"]["generated_lesson_jobs"]["Row"];
type Request = Database["public"]["Tables"]["custom_lesson_requests"]["Row"];
type Lesson = Database["public"]["Tables"]["lessons"]["Row"];
type Validation = Database["public"]["Tables"]["lesson_validation_runs"]["Row"];
type Check = Database["public"]["Tables"]["lesson_validation_checks"]["Row"];

export interface GeneratedQueueItem {
  job: Job;
  request: Request | null;
  lesson: Lesson | null;
  validation: Validation | null;
  requester: Pick<ProfileRow, "id" | "display_name" | "email"> | null;
}

export interface GeneratedDetailData extends GeneratedQueueItem {
  checks: Check[];
}

function firstError(results: Array<{ error: { message: string } | null }>) {
  return results.find((result) => result.error)?.error ?? null;
}

export const adminGeneratedRepository = {
  async list(): Promise<RepositoryResult<GeneratedQueueItem[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const [jobs, requests, lessons, validations, profiles] = await Promise.all([
      client.from("generated_lesson_jobs").select("*").order("created_at", { ascending: false }).limit(250),
      client.from("custom_lesson_requests").select("*").order("created_at", { ascending: false }).limit(500),
      client.from("lessons").select("*").order("updated_at", { ascending: false }).limit(500),
      client.from("lesson_validation_runs").select("*").order("created_at", { ascending: false }).limit(500),
      client.from("profiles").select("id,display_name,email").limit(1000),
    ]);
    const error = firstError([jobs, requests, lessons, validations, profiles]);
    if (error) return failure(error, "Generated lesson operations could not be loaded.");

    const requestById = new Map((requests.data ?? []).map((item) => [item.id, item]));
    const lessonById = new Map((lessons.data ?? []).map((item) => [item.id, item]));
    const profileById = new Map((profiles.data ?? []).map((item) => [item.id, item]));
    const validationByLesson = new Map<string, Validation>();
    for (const run of validations.data ?? []) {
      if (!validationByLesson.has(run.lesson_id)) validationByLesson.set(run.lesson_id, run);
    }

    return success((jobs.data ?? []).map((job) => ({
      job,
      request: requestById.get(job.custom_lesson_request_id) ?? null,
      lesson: job.lesson_id ? lessonById.get(job.lesson_id) ?? null : null,
      validation: job.lesson_id ? validationByLesson.get(job.lesson_id) ?? null : null,
      requester: profileById.get(job.created_by) ?? null,
    })));
  },

  async getDetail(lessonId: string): Promise<RepositoryResult<GeneratedDetailData>> {
    const client = createClient();
    if (!client) return notConfigured();
    const [lesson, jobs, validations] = await Promise.all([
      client.from("lessons").select("*").eq("id", lessonId).maybeSingle(),
      client.from("generated_lesson_jobs").select("*").eq("lesson_id", lessonId).order("created_at", { ascending: false }).limit(1),
      client.from("lesson_validation_runs").select("*").eq("lesson_id", lessonId).order("created_at", { ascending: false }).limit(1),
    ]);
    const baseError = firstError([lesson, jobs, validations]);
    if (baseError) return failure(baseError, "Generated lesson detail could not be loaded.");
    const job = jobs.data?.[0] ?? null;
    if (!job) return failure({ code: "NOT_FOUND", message: "No generated job is linked to this lesson." }, "No generated job is linked to this lesson.");
    const validation = validations.data?.[0] ?? null;

    const [request, profile, checks] = await Promise.all([
      client.from("custom_lesson_requests").select("*").eq("id", job.custom_lesson_request_id).maybeSingle(),
      client.from("profiles").select("id,display_name,email").eq("id", job.created_by).maybeSingle(),
      validation
        ? client.from("lesson_validation_checks").select("*").eq("validation_run_id", validation.id).order("category").order("created_at")
        : Promise.resolve({ data: [] as Check[], error: null }),
    ]);
    const detailError = firstError([request, profile, checks]);
    if (detailError) return failure(detailError, "Generated lesson detail could not be loaded.");

    return success({
      job,
      request: request.data ?? null,
      lesson: lesson.data ?? null,
      validation,
      requester: profile.data ?? null,
      checks: checks.data ?? [],
    });
  },
};
