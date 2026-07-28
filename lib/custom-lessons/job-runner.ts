import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareStoredLessonAudio } from "@/lib/audio/audio-library";
import {
  assemblePlayableLesson,
  generateFinalReviewActivities,
  generateGrammarAndReadingActivities,
  generateListeningAndSpeakingActivities,
  generateVocabularyAndKanjiActivities,
  type ActivityGroupName,
  type ActivityGroups,
  type CommunicationGroup,
  type GrammarReadingGroup,
  type ReviewGroup,
  type VocabularyKanjiGroup,
} from "@/lib/gemini/lesson-activity-groups";
import type {
  GenerationAuditEntry,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

const MAX_BUILD_ATTEMPTS = 3;
const MAX_AUDIO_ATTEMPTS = 3;
const DEFAULT_MAX_CYCLES = 2;
const SOFT_RUNTIME_LIMIT_MS = 235_000;

export type CustomLessonJobStatus =
  | "story_building"
  | "story_ready"
  | "library_resolved"
  | "activities_queued"
  | "activities_building"
  | "activities_validating"
  | "activities_ready"
  | "activities_failed"
  | "lesson_saving"
  | "lesson_ready"
  | "audio_queued"
  | "audio_building"
  | "completed"
  | "failed";

export interface ProgressiveLessonJob {
  request_id: string;
  job_id: string | null;
  user_id: string;
  topic: string;
  jlpt_level: JLPTLevel;
  story_draft: Json;
  library_snapshot: Json;
  generation_audit: Json;
  status: CustomLessonJobStatus;
  current_stage: string;
  progress_percent: number;
  build_attempts: number;
  completed_groups: string[];
  failed_groups: string[];
  group_attempts: Json;
  vocabulary_kanji_group: Json | null;
  grammar_reading_group: Json | null;
  communication_group: Json | null;
  review_group: Json | null;
  worker_token: string | null;
  lesson_id: string | null;
  lesson_version_id: string | null;
  assignment_id: string | null;
  audio_status: "pending" | "queued" | "building" | "ready" | "failed";
  audio_attempts: number;
}

export interface CustomLessonWorkerResult {
  claimed: boolean;
  requestId: string | null;
  status: CustomLessonJobStatus | "idle";
  lessonReady: boolean;
  audioStatus?: ProgressiveLessonJob["audio_status"];
  retryable?: boolean;
}

type AdminClient = SupabaseClient;
type GroupPayload =
  | VocabularyKanjiGroup
  | GrammarReadingGroup
  | CommunicationGroup
  | ReviewGroup;

function adminClient(): AdminClient {
  return createAdminClient() as unknown as AdminClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asJob(value: unknown): ProgressiveLessonJob | null {
  if (!isRecord(value)) return null;
  const requestId = stringValue(value.request_id);
  const userId = stringValue(value.user_id);
  const topic = stringValue(value.topic);
  const level = value.jlpt_level;
  const status = value.status;
  if (
    !requestId ||
    !userId ||
    !topic ||
    (level !== "N5" && level !== "N4" && level !== "N3" && level !== "N2" && level !== "N1") ||
    typeof status !== "string"
  ) {
    return null;
  }
  return value as unknown as ProgressiveLessonJob;
}

function auditEntries(value: Json): GenerationAuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is GenerationAuditEntry => {
    if (!isRecord(entry)) return false;
    return typeof entry.stage === "string" &&
      typeof entry.model === "string" &&
      typeof entry.repaired === "boolean";
  });
}

function resultRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

async function loadJob(
  admin: AdminClient,
  requestId: string,
): Promise<ProgressiveLessonJob | null> {
  const result = await admin
    .from("progressive_lesson_drafts")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return asJob(result.data);
}

function groupPayload(job: ProgressiveLessonJob, group: ActivityGroupName): Json | null {
  if (group === "vocabulary_and_kanji") return job.vocabulary_kanji_group;
  if (group === "grammar_and_reading") return job.grammar_reading_group;
  if (group === "listening_and_speaking") return job.communication_group;
  return job.review_group;
}

const activityGroups: ActivityGroupName[] = [
  "vocabulary_and_kanji",
  "grammar_and_reading",
  "listening_and_speaking",
  "final_review",
];

async function generateGroup(
  group: ActivityGroupName,
  input: {
    topic: string;
    level: JLPTLevel;
    draft: StoryDraft;
    library: ResolvedLessonLibrary;
  },
): Promise<{ value: GroupPayload; audit: GenerationAuditEntry }> {
  if (group === "vocabulary_and_kanji") {
    return generateVocabularyAndKanjiActivities(input);
  }
  if (group === "grammar_and_reading") {
    return generateGrammarAndReadingActivities(input);
  }
  if (group === "listening_and_speaking") {
    return generateListeningAndSpeakingActivities(input);
  }
  return generateFinalReviewActivities(input);
}

async function persistGroup(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  group: ActivityGroupName,
  payload: GroupPayload,
  audit: GenerationAuditEntry,
): Promise<void> {
  if (!job.worker_token) throw new Error("The generation claim is missing.");
  const saved = await admin.rpc("save_progressive_lesson_group", {
    p_request_id: job.request_id,
    p_worker_token: job.worker_token,
    p_group: group,
    p_payload: payload as unknown as Json,
    p_audit: audit as unknown as Json,
  });
  if (saved.error) throw new Error(saved.error.message);
}

function incrementAttempts(
  value: Json,
  groups: ActivityGroupName[],
): Record<string, number> {
  const source = isRecord(value) ? value : {};
  const result: Record<string, number> = {};
  for (const group of activityGroups) {
    const current = source[group];
    result[group] = typeof current === "number" && Number.isFinite(current)
      ? Math.max(0, Math.round(current))
      : 0;
  }
  for (const group of groups) result[group] += 1;
  return result;
}

function groupsFromJob(job: ProgressiveLessonJob): ActivityGroups | null {
  if (
    !isRecord(job.vocabulary_kanji_group) ||
    !isRecord(job.grammar_reading_group) ||
    !isRecord(job.communication_group) ||
    !isRecord(job.review_group)
  ) {
    return null;
  }
  return {
    vocabularyAndKanji: job.vocabulary_kanji_group as unknown as VocabularyKanjiGroup,
    grammarAndReading: job.grammar_reading_group as unknown as GrammarReadingGroup,
    communication: job.communication_group as unknown as CommunicationGroup,
    review: job.review_group as unknown as ReviewGroup,
  };
}

async function markActivityFailure(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  failedGroups: ActivityGroupName[],
  errors: string[],
): Promise<CustomLessonWorkerResult> {
  const permanent = job.build_attempts >= MAX_BUILD_ATTEMPTS;
  const internalMessage = errors.join(" | ").slice(0, 1_000) || "Activity generation failed.";
  const updated = await admin
    .from("progressive_lesson_drafts")
    .update({
      status: permanent ? "failed" : "activities_failed",
      current_stage: permanent ? "failed" : "retrying_activity_groups",
      failed_groups: failedGroups,
      group_attempts: incrementAttempts(job.group_attempts, failedGroups),
      last_error: internalMessage,
      worker_token: null,
      claimed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", job.request_id)
    .eq("worker_token", job.worker_token);
  if (updated.error) throw new Error(updated.error.message);

  if (permanent) {
    await Promise.all([
      admin
        .from("custom_lesson_requests")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", job.request_id),
      admin
        .from("generated_lesson_jobs")
        .update({ status: "failed", error_message: internalMessage, updated_at: new Date().toISOString() })
        .eq("custom_lesson_request_id", job.request_id),
    ]);
  }
  console.error("Custom lesson activity groups failed.", {
    requestId: job.request_id,
    failedGroups,
    buildAttempt: job.build_attempts,
  });
  return {
    claimed: true,
    requestId: job.request_id,
    status: permanent ? "failed" : "activities_failed",
    lessonReady: false,
    retryable: !permanent,
  };
}

async function prepareAudioJob(
  admin: AdminClient,
  requestId?: string,
): Promise<CustomLessonWorkerResult | null> {
  const claim = await admin.rpc("claim_progressive_lesson_audio_job", {
    p_request_id: requestId ?? null,
  });
  if (claim.error) throw new Error(claim.error.message);
  const job = asJob(claim.data);
  if (!job) return null;
  if (!job.lesson_version_id) throw new Error("The lesson version is missing.");

  try {
    await prepareStoredLessonAudio(job.lesson_version_id, admin);
    const audit = [
      ...auditEntries(job.generation_audit),
      { stage: "audio", model: "google-cloud-tts", repaired: false } as GenerationAuditEntry,
    ];
    const saved = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "completed",
        current_stage: "completed",
        progress_percent: 100,
        audio_status: "ready",
        audio_prepared_at: new Date().toISOString(),
        audio_error: null,
        generation_audit: audit as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", job.request_id);
    if (saved.error) throw new Error(saved.error.message);
    return {
      claimed: true,
      requestId: job.request_id,
      status: "completed",
      lessonReady: true,
      audioStatus: "ready",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audio preparation failed.";
    const retryable = job.audio_attempts < MAX_AUDIO_ATTEMPTS;
    const saved = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "completed",
        current_stage: "completed",
        progress_percent: 100,
        audio_status: "failed",
        audio_error: message.slice(0, 1_000),
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", job.request_id);
    if (saved.error) throw new Error(saved.error.message);
    console.error("Custom lesson audio failed without blocking the lesson.", {
      requestId: job.request_id,
      audioAttempt: job.audio_attempts,
    });
    return {
      claimed: true,
      requestId: job.request_id,
      status: "completed",
      lessonReady: true,
      audioStatus: "failed",
      retryable,
    };
  }
}

async function processActivityJob(
  admin: AdminClient,
  requestId?: string,
): Promise<CustomLessonWorkerResult | null> {
  const claim = await admin.rpc("claim_progressive_lesson_job", {
    p_request_id: requestId ?? null,
  });
  if (claim.error) throw new Error(claim.error.message);
  const job = asJob(claim.data);
  if (!job) return null;

  const draft = job.story_draft as unknown as StoryDraft;
  const library = job.library_snapshot as unknown as ResolvedLessonLibrary;
  const missing = activityGroups.filter((group) => !groupPayload(job, group));
  const startedAt = Date.now();
  const executions = missing.map(async (group) => {
    const generated = await generateGroup(group, {
      topic: job.topic,
      level: job.jlpt_level,
      draft,
      library,
    });
    await persistGroup(admin, job, group, generated.value, generated.audit);
    return group;
  });
  const settled = await Promise.allSettled(executions);
  const failedGroups: ActivityGroupName[] = [];
  const errors: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    failedGroups.push(missing[index]);
    errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  });

  const refreshed = await loadJob(admin, job.request_id);
  if (!refreshed) throw new Error("The claimed generation job disappeared.");
  if (failedGroups.length > 0) {
    return markActivityFailure(admin, refreshed, failedGroups, errors);
  }

  const groups = groupsFromJob(refreshed);
  if (!groups) {
    return markActivityFailure(
      admin,
      refreshed,
      activityGroups.filter((group) => !groupPayload(refreshed, group)),
      ["One or more validated activity groups were not persisted."],
    );
  }

  const validating = await admin
    .from("progressive_lesson_drafts")
    .update({
      status: "activities_validating",
      current_stage: "quality_check",
      progress_percent: 78,
      updated_at: new Date().toISOString(),
    })
    .eq("request_id", refreshed.request_id)
    .eq("worker_token", refreshed.worker_token);
  if (validating.error) throw new Error(validating.error.message);

  try {
    const audit = [
      ...auditEntries(refreshed.generation_audit),
      { stage: "lesson_assembly", model: "deterministic", repaired: false } as GenerationAuditEntry,
    ];
    const lesson = assemblePlayableLesson({
      topic: refreshed.topic,
      level: refreshed.jlpt_level,
      draft,
      library,
      groups,
      audit,
    });
    const saving = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "lesson_saving",
        current_stage: "saving_lesson",
        progress_percent: 84,
        generation_audit: audit as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", refreshed.request_id)
      .eq("worker_token", refreshed.worker_token);
    if (saving.error) throw new Error(saving.error.message);

    const stored = await admin.rpc("store_generated_lesson_package_background", {
      p_request_id: refreshed.request_id,
      p_package: lesson as unknown as Json,
      p_generation_seconds: Math.round((Date.now() - startedAt) / 1_000),
    });
    if (stored.error) throw new Error(stored.error.message);
    const value = resultRecord(stored.data);
    const lessonId = stringValue(value.lesson_id);
    const lessonVersionId = stringValue(value.lesson_version_id);
    const assignmentId = stringValue(value.assignment_id);
    if (!lessonId || !lessonVersionId) {
      throw new Error("The saved lesson identifiers were not returned.");
    }

    const ready = await admin
      .from("progressive_lesson_drafts")
      .update({
        status: "lesson_ready",
        current_stage: "audio",
        progress_percent: 90,
        lesson_id: lessonId,
        lesson_version_id: lessonVersionId,
        assignment_id: assignmentId,
        audio_status: "queued",
        worker_token: null,
        claimed_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("request_id", refreshed.request_id);
    if (ready.error) throw new Error(ready.error.message);

    const audio = await prepareAudioJob(admin, refreshed.request_id);
    return audio ?? {
      claimed: true,
      requestId: refreshed.request_id,
      status: "lesson_ready",
      lessonReady: true,
      audioStatus: "queued",
    };
  } catch (error) {
    return markActivityFailure(
      admin,
      refreshed,
      [],
      [error instanceof Error ? error.message : "Lesson assembly failed."],
    );
  }
}

export async function processCustomLessonJobs(options: {
  requestId?: string;
  maxCycles?: number;
} = {}): Promise<CustomLessonWorkerResult> {
  const admin = adminClient();
  const startedAt = Date.now();
  const cycles = Math.max(1, Math.min(options.maxCycles ?? DEFAULT_MAX_CYCLES, 3));
  let latest: CustomLessonWorkerResult | null = null;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    if (Date.now() - startedAt >= SOFT_RUNTIME_LIMIT_MS) break;
    const activities = await processActivityJob(admin, options.requestId);
    if (activities) {
      latest = activities;
      if (!activities.retryable || activities.lessonReady) return activities;
      continue;
    }
    const audio = await prepareAudioJob(admin, options.requestId);
    if (audio) return audio;
    break;
  }

  if (latest) return latest;
  return {
    claimed: false,
    requestId: options.requestId ?? null,
    status: "idle",
    lessonReady: false,
  };
}
