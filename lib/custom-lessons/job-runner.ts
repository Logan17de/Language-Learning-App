import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareStoredLessonAudio } from "@/lib/audio/audio-library";
import { mapStoredLessonTerms } from "@/lib/gemini/inspectable-term-mapping";
import {
  ACTIVITY_GROUPS,
  activityGroupCheckpointIssues,
  groupForPackageIssue,
  inspectPersistedActivityCheckpoints,
  normalizeGeneratedCheckpoint,
  playableLessonPackageIssues,
  resolvedLibraryCheckpointIssues,
  storyCheckpointIssues,
  type ActivityGroupName,
} from "@/lib/custom-lessons/checkpoint-validation";
import {
  saveGenerationTrace,
  withGenerationTraceContext,
} from "@/lib/custom-lessons/generation-trace";
import { ensureLessonPlanTeachingRecords } from "@/lib/custom-lessons/placeholder-enrichment";
import {
  classifyGenerationError,
  finalizationFailureAction,
  retryBackoffMs,
  type CustomLessonStage,
} from "@/lib/custom-lessons/reliability";
import { generateAdaptiveStoryDraft } from "@/lib/gemini/adaptive-story-generation";
import {
  assemblePlayableLesson,
  generateGrammarAndReadingActivities,
  generateListeningAndSpeakingActivities,
  generateVocabularyAndKanjiActivities,
  type ActivityGroups,
  type CommunicationGroup,
  type GrammarReadingGroup,
  type VocabularyKanjiGroup,
} from "@/lib/gemini/lesson-activity-groups";
import type {
  GenerationAuditEntry,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import { selectLessonPlanV3 } from "@/lib/gemini/lesson-plan-v3";
import { enrichGeneratedStoryVocabulary } from "@/lib/gemini/simple-story-enrichment";
import { resolveStoryFromExistingLibrary } from "@/lib/gemini/story-library-existing-only";
import type {
  LessonPlanV3,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

const MAX_STAGE_ATTEMPTS = 3;
const MAX_GROUP_ATTEMPTS = 3;
const DEFAULT_MAX_CYCLES = 1;
const SOFT_RUNTIME_LIMIT_MS = 235_000;

export interface ProgressiveLessonJob {
  request_id: string;
  job_id: string | null;
  user_id: string;
  topic: string;
  jlpt_level: JLPTLevel;
  lesson_plan: Json | null;
  story_draft: Json | null;
  library_snapshot: Json | null;
  lesson_package: Json | null;
  generation_audit: Json;
  status: CustomLessonStage;
  current_stage: string;
  progress_percent: number;
  stage_attempts: Json;
  group_attempts: Json;
  completed_groups: string[];
  failed_groups: string[];
  vocabulary_kanji_group: Json | null;
  grammar_reading_group: Json | null;
  communication_group: Json | null;
  worker_token: string | null;
  claimed_at: string | null;
  last_action: string | null;
  lesson_id: string | null;
  lesson_version_id: string | null;
  assignment_id: string | null;
  audio_status: "pending" | "queued" | "building" | "ready" | "failed";
  audio_attempts: number;
}

export interface CustomLessonWorkerResult {
  claimed: boolean;
  requestId: string | null;
  status: CustomLessonStage | "idle";
  lessonReady: boolean;
  audioStatus?: ProgressiveLessonJob["audio_status"];
  retryable?: boolean;
}

type AdminClient = SupabaseClient;
type GroupPayload =
  | VocabularyKanjiGroup
  | GrammarReadingGroup
  | CommunicationGroup;

function adminClient(): AdminClient {
  return createAdminClient() as unknown as AdminClient;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asJob(value: unknown): ProgressiveLessonJob | null {
  if (
    !isRecord(value) ||
    !text(value.request_id) ||
    !text(value.user_id) ||
    !text(value.topic)
  ) {
    return null;
  }
  return value as unknown as ProgressiveLessonJob;
}

function numericAttempt(value: Json, key: string): number {
  if (!isRecord(value)) return 0;
  const attempt = value[key];
  return typeof attempt === "number" && Number.isFinite(attempt)
    ? Math.max(0, Math.round(attempt))
    : 0;
}

function auditEntries(value: Json): GenerationAuditEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: GenerationAuditEntry[] = [];
  for (const entry of value) {
    if (
      isRecord(entry) &&
      typeof entry.stage === "string" &&
      typeof entry.model === "string" &&
      typeof entry.repaired === "boolean"
    ) {
      entries.push(entry as unknown as GenerationAuditEntry);
    }
  }
  return entries;
}

function resultRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function storyKanjiCounts(
  draft: StoryOnlyDraft,
): Array<{ character: string; count: number }> {
  const counts = new Map<string, number>();
  for (const line of draft.lines) {
    for (const character of line.japanese.match(/\p{Script=Han}/gu) ?? []) {
      counts.set(character, (counts.get(character) ?? 0) + 1);
    }
  }
  return [...counts].map(([character, count]) => ({ character, count }));
}

function groupPayload(
  job: ProgressiveLessonJob,
  group: ActivityGroupName,
): Json | null {
  if (group === "vocabulary_and_kanji") return job.vocabulary_kanji_group;
  if (group === "grammar_and_reading") return job.grammar_reading_group;
  return job.communication_group;
}

function checkpoints(
  job: ProgressiveLessonJob,
): Partial<Record<ActivityGroupName, unknown>> {
  return Object.fromEntries(
    ACTIVITY_GROUPS.map((group) => [group, groupPayload(job, group)]),
  );
}

function groupsFromJob(job: ProgressiveLessonJob): ActivityGroups | null {
  if (
    !isRecord(job.vocabulary_kanji_group) ||
    !isRecord(job.grammar_reading_group) ||
    !isRecord(job.communication_group)
  ) {
    return null;
  }
  return {
    vocabularyAndKanji:
      job.vocabulary_kanji_group as unknown as VocabularyKanjiGroup,
    grammarAndReading:
      job.grammar_reading_group as unknown as GrammarReadingGroup,
    communication: job.communication_group as unknown as CommunicationGroup,
  };
}

async function loadJob(
  admin: AdminClient,
  requestId: string,
): Promise<ProgressiveLessonJob | null> {
  const found = await admin
    .from("progressive_lesson_drafts")
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();
  if (found.error) {
    throw Object.assign(new Error(found.error.message), { code: found.error.code });
  }
  return asJob(found.data);
}

async function claimedUpdate(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  values: Record<string, unknown>,
): Promise<void> {
  if (!job.worker_token) throw new Error("The generation claim is missing.");
  const saved = await admin
    .from("progressive_lesson_drafts")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("request_id", job.request_id)
    .eq("worker_token", job.worker_token)
    .select("request_id")
    .maybeSingle();
  if (saved.error) {
    throw Object.assign(new Error(saved.error.message), { code: saved.error.code });
  }
  if (!saved.data) {
    throw Object.assign(new Error("Generation job is no longer claimed."), {
      code: "40001",
    });
  }
}

async function failRequestPermanently(
  admin: AdminClient,
  requestId: string,
  message: string,
): Promise<void> {
  await Promise.all([
    admin
      .from("custom_lesson_requests")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", requestId),
    admin
      .from("generated_lesson_jobs")
      .update({
        status: "failed",
        error_message: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("custom_lesson_request_id", requestId),
  ]);
}

async function finishStage(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  nextStage: CustomLessonStage,
  progressPercent: number,
  values: Record<string, unknown> = {},
): Promise<CustomLessonWorkerResult> {
  await claimedUpdate(admin, job, {
    ...values,
    status: nextStage,
    current_stage: nextStage,
    progress_percent: Math.max(job.progress_percent, progressPercent),
    resume_stage: null,
    next_attempt_at: new Date().toISOString(),
    worker_token: null,
    claimed_at: null,
    last_error: null,
    failure_classification: null,
    provider_request_id: null,
    last_action: text(values.last_action) ?? "checkpoint_persisted",
  });
  return {
    claimed: true,
    requestId: job.request_id,
    status: nextStage,
    lessonReady: Boolean(values.lesson_id ?? job.lesson_id),
    audioStatus: (values.audio_status ??
      job.audio_status) as ProgressiveLessonJob["audio_status"],
  };
}

async function scheduleFailure(input: {
  admin: AdminClient;
  job: ProgressiveLessonJob;
  stage: CustomLessonStage;
  group?: ActivityGroupName;
  attempt: number;
  startedAt: number;
  error: unknown;
}): Promise<CustomLessonWorkerResult> {
  const failure = classifyGenerationError(input.error);
  const exhausted =
    input.attempt >= (input.group ? MAX_GROUP_ATTEMPTS : MAX_STAGE_ATTEMPTS);
  const permanent = !failure.retryable || exhausted;
  const durationMs = Date.now() - input.startedAt;
  const delayMs =
    failure.classification === "content"
      ? 1_000
      : retryBackoffMs(input.attempt, Math.random());
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  await claimedUpdate(input.admin, input.job, {
    status: permanent ? "permanent_failure" : "retryable_failure",
    current_stage: permanent ? "permanent_failure" : "retryable_failure",
    resume_stage: permanent ? null : input.stage,
    next_attempt_at: permanent ? new Date().toISOString() : nextAttemptAt,
    failed_groups: input.group ? [input.group] : input.job.failed_groups,
    last_error: failure.message.slice(0, 1_000),
    failure_classification: failure.classification,
    provider_request_id: failure.providerRequestId,
    last_duration_ms: durationMs,
    last_action:
      failure.classification === "content" ? "regenerated" : "resumed",
    worker_token: null,
    claimed_at: null,
  });
  if (permanent) {
    await failRequestPermanently(
      input.admin,
      input.job.request_id,
      failure.message,
    );
  }

  const metadata = {
    requestId: input.job.request_id,
    stage: input.stage,
    group: input.group ?? null,
    attempt: input.attempt,
    errorClassification: failure.classification,
    providerRequestId: failure.providerRequestId,
    durationMs,
    action:
      failure.classification === "content" ? "regenerated" : "resumed",
    permanent,
    delayMs: permanent ? null : delayMs,
  };
  console.error("Custom lesson stage failed.", {
    ...metadata,
    message: failure.message,
  });
  await saveGenerationTrace({
    trace: {
      requestId: input.job.request_id,
      stage: input.stage,
      group: input.group,
    },
    name: input.group ?? input.stage,
    eventType: "stage_failure",
    attempt: input.attempt,
    issues: [failure.message],
    metadata,
  });
  return {
    claimed: true,
    requestId: input.job.request_id,
    status: permanent ? "permanent_failure" : "retryable_failure",
    lessonReady: Boolean(input.job.lesson_id),
    audioStatus: input.job.audio_status,
    retryable: !permanent,
  };
}

function collectIds(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    value.forEach((child) => collectIds(child, output));
    return output;
  }
  if (!isRecord(value)) return output;
  for (const [key, child] of Object.entries(value)) {
    if (
      (key === "libraryId" || key === "targetItemIds") &&
      typeof child === "string"
    ) {
      output.add(child);
    }
    if (key === "targetItemIds" && Array.isArray(child)) {
      child.forEach((id) => {
        if (typeof id === "string") output.add(id);
      });
    }
    collectIds(child, output);
  }
  return output;
}

async function existingLibraryIds(
  admin: AdminClient,
  ...values: unknown[]
): Promise<Set<string>> {
  const requested = [
    ...values.reduce<Set<string>>(
      (ids, value) => collectIds(value, ids),
      new Set<string>(),
    ),
  ];
  if (requested.length < 1) return new Set();
  const [kanji, vocabulary, grammar] = await Promise.all([
    admin
      .from("kanji_records")
      .select("id")
      .in("id", requested)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    admin
      .from("vocabulary_records")
      .select("id")
      .in("id", requested)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    admin
      .from("grammar_records")
      .select("id")
      .in("id", requested)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
  ]);
  const error = kanji.error ?? vocabulary.error ?? grammar.error;
  if (error) {
    throw Object.assign(new Error(error.message), { code: error.code });
  }
  return new Set(
    [...(kanji.data ?? []), ...(vocabulary.data ?? []), ...(grammar.data ?? [])]
      .flatMap((row) => (typeof row.id === "string" ? [row.id] : [])),
  );
}

async function invalidateGroup(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  group: ActivityGroupName,
  reason: string,
): Promise<void> {
  const invalidated = await admin.rpc("invalidate_progressive_lesson_group", {
    p_request_id: job.request_id,
    p_worker_token: job.worker_token,
    p_group: group,
    p_reason: reason.slice(0, 1_000),
  });
  if (invalidated.error) {
    throw Object.assign(new Error(invalidated.error.message), {
      code: invalidated.error.code,
    });
  }
}

async function persistGroup(
  admin: AdminClient,
  job: ProgressiveLessonJob,
  group: ActivityGroupName,
  payload: GroupPayload,
  audit: GenerationAuditEntry,
): Promise<void> {
  const saved = await admin.rpc("save_progressive_lesson_group", {
    p_request_id: job.request_id,
    p_worker_token: job.worker_token,
    p_group: group,
    p_payload: payload as unknown as Json,
    p_audit: audit as unknown as Json,
  });
  if (saved.error) {
    throw Object.assign(new Error(saved.error.message), { code: saved.error.code });
  }
}

async function generateGroup(
  group: ActivityGroupName,
  input: {
    requestId: string;
    admin: AdminClient;
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
  return generateListeningAndSpeakingActivities(input);
}

async function processStory(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const plan = await selectLessonPlanV3(
    admin as unknown as SupabaseClient<Database>,
    job.user_id,
    job.topic,
    job.jlpt_level,
  );
  const story = await generateAdaptiveStoryDraft({
    requestId: job.request_id,
    topic: job.topic,
    level: job.jlpt_level,
    plan,
  });
  const issues = storyCheckpointIssues(story.draft);
  if (issues.length > 0) {
    throw new Error(`Story checkpoint validation failed: ${issues.join(" ")}`);
  }
  const result = await finishStage(admin, job, "vocabulary_enrichment", 10, {
    lesson_plan: plan as unknown as Json,
    story_draft: story.draft as unknown as Json,
    generation_audit: [
      ...auditEntries(job.generation_audit),
      story.audit,
    ] as unknown as Json,
  });
  const exposureStartedAt = Date.now();
  const exposures = await admin.rpc("record_story_kanji_exposures_background", {
    p_request_id: job.request_id,
    p_counts: storyKanjiCounts(story.draft) as unknown as Json,
  });
  if (exposures.error) {
    const failure = classifyGenerationError(exposures.error);
    console.warn("Custom lesson story exposure checkpoint was skipped.", {
      requestId: job.request_id,
      stage: "story_building",
      attempt: numericAttempt(job.stage_attempts, "story_building"),
      errorClassification: failure.classification,
      providerRequestId: null,
      durationMs: Date.now() - exposureStartedAt,
      action: "resumed",
    });
    await saveGenerationTrace({
      trace: {
        requestId: job.request_id,
        stage: "story_building",
        group: "kanji_exposure",
      },
      name: "kanji_exposure",
      eventType: "stage_failure",
      attempt: numericAttempt(job.stage_attempts, "story_building"),
      issues: [exposures.error.message],
      metadata: {
        requestId: job.request_id,
        stage: "story_building",
        group: "kanji_exposure",
        attempt: numericAttempt(job.stage_attempts, "story_building"),
        errorClassification: failure.classification,
        providerRequestId: null,
        durationMs: Date.now() - exposureStartedAt,
        action: "resumed",
        lessonBlocking: false,
      },
    });
  }
  return result;
}

async function processVocabularyEnrichment(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const draft = job.story_draft as unknown as StoryOnlyDraft;
  const storyIssues = storyCheckpointIssues(draft);
  if (storyIssues.length > 0) {
    throw new Error(
      `Story checkpoint validation failed: ${storyIssues.join(" ")}`,
    );
  }
  const enrichment = await enrichGeneratedStoryVocabulary({
    admin,
    requestId: job.request_id,
    level: job.jlpt_level,
    draft,
  });
  return finishStage(admin, job, "library_resolution", 16, {
    generation_audit: [
      ...auditEntries(job.generation_audit),
      enrichment.audit,
    ] as unknown as Json,
  });
}

async function processLibraryResolution(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const plan = job.lesson_plan as unknown as LessonPlanV3;
  const draft = job.story_draft as unknown as StoryOnlyDraft;
  if (!plan || !Array.isArray(plan.kanji) || !Array.isArray(plan.grammar)) {
    throw new Error(
      "Story plan checkpoint validation failed: selected targets are missing.",
    );
  }
  const enrichmentAudit = await ensureLessonPlanTeachingRecords({
    admin,
    requestId: job.request_id,
    topic: job.topic,
    level: job.jlpt_level,
    plan,
  });
  const resolved = await resolveStoryFromExistingLibrary(
    admin as unknown as SupabaseClient<Database>,
    { level: job.jlpt_level, plan, draft },
  );
  const validIds = await existingLibraryIds(admin, resolved.library);
  const issues = [
    ...storyCheckpointIssues(resolved.draft),
    ...resolvedLibraryCheckpointIssues(resolved.library, validIds),
  ];
  if (issues.length > 0) {
    throw new Error(`Library checkpoint validation failed: ${issues.join(" ")}`);
  }
  return finishStage(admin, job, "activity_groups", 22, {
    story_draft: resolved.draft as unknown as Json,
    library_snapshot: resolved.library as unknown as Json,
    generation_audit: [
      ...auditEntries(job.generation_audit),
      enrichmentAudit,
      ...resolved.audits,
    ] as unknown as Json,
  });
}

async function processActivityGroup(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const startedAt = Date.now();
  const draft = job.story_draft as unknown as StoryDraft;
  const library = job.library_snapshot as unknown as ResolvedLessonLibrary;
  let validIds = await existingLibraryIds(admin, library, checkpoints(job));
  const libraryIssues = resolvedLibraryCheckpointIssues(library, validIds);
  if (libraryIssues.length > 0) {
    return finishStage(admin, job, "library_resolution", 22, {
      library_snapshot: null,
      lesson_package: null,
      last_action: "invalidated_checkpoint",
    });
  }
  let current = job;
  let inspection = inspectPersistedActivityCheckpoints(
    checkpoints(current),
    validIds,
  );
  const invalidatedGroups = new Set(
    inspection.invalid.map((item) => item.group),
  );
  for (const invalid of inspection.invalid) {
    await invalidateGroup(admin, current, invalid.group, invalid.issues.join(" "));
  }
  if (inspection.invalid.length > 0) {
    current = (await loadJob(admin, job.request_id)) ?? job;
    validIds = await existingLibraryIds(admin, library, checkpoints(current));
    inspection = inspectPersistedActivityCheckpoints(
      checkpoints(current),
      validIds,
    );
  }

  const group = inspection.missing[0];
  if (!group) return finishStage(admin, current, "final_validation", 78);
  const attempt = numericAttempt(current.group_attempts, group) + 1;
  if (attempt > MAX_GROUP_ATTEMPTS) {
    return scheduleFailure({
      admin,
      job: current,
      stage: "activity_groups",
      group,
      attempt,
      startedAt,
      error: new Error(
        `${group} checkpoint validation failed after ${MAX_GROUP_ATTEMPTS} attempts.`,
      ),
    });
  }
  const groupAttempts = {
    ...(isRecord(current.group_attempts) ? current.group_attempts : {}),
    activity_infrastructure: 0,
    [group]: attempt,
  };
  await claimedUpdate(admin, current, {
    group_attempts: groupAttempts,
    current_stage: `activity_groups:${group}`,
    last_action: invalidatedGroups.has(group) ? "regenerated" : "claimed",
  });
  current = { ...current, group_attempts: groupAttempts };

  try {
    const generated = await withGenerationTraceContext(
      { requestId: current.request_id, stage: "activity_groups", group },
      () =>
        generateGroup(group, {
          requestId: current.request_id,
          admin,
          topic: current.topic,
          level: current.jlpt_level,
          draft,
          library,
        }),
    );
    const normalized = normalizeGeneratedCheckpoint(
      generated.value,
    ) as GroupPayload;
    const ids = await existingLibraryIds(admin, library, normalized);
    const issues = activityGroupCheckpointIssues(group, normalized, ids);
    if (issues.length > 0) {
      throw new Error(
        `${group} checkpoint validation failed: ${issues.join(" ")}`,
      );
    }
    await persistGroup(admin, current, group, normalized, generated.audit);
    return finishStage(
      admin,
      current,
      "activity_groups",
      Math.min(74, 26 + (inspection.valid.length + 1) * 12),
    );
  } catch (error) {
    return scheduleFailure({
      admin,
      job: current,
      stage: "activity_groups",
      group,
      attempt,
      startedAt,
      error,
    });
  }
}

async function processFinalValidation(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const library = job.library_snapshot as unknown as ResolvedLessonLibrary;
  const validIds = await existingLibraryIds(admin, library, checkpoints(job));
  const libraryIssues = resolvedLibraryCheckpointIssues(library, validIds);
  if (libraryIssues.length > 0) {
    return finishStage(admin, job, "library_resolution", 78, {
      library_snapshot: null,
      lesson_package: null,
      last_action: "invalidated_checkpoint",
    });
  }
  const inspection = inspectPersistedActivityCheckpoints(
    checkpoints(job),
    validIds,
  );
  if (inspection.invalid.length > 0) {
    for (const invalid of inspection.invalid) {
      await invalidateGroup(admin, job, invalid.group, invalid.issues.join(" "));
    }
    return finishStage(admin, job, "activity_groups", 78, {
      last_action: "invalidated_checkpoint",
    });
  }
  const groups = groupsFromJob(job);
  if (!groups || inspection.missing.length > 0) {
    return finishStage(admin, job, "activity_groups", 78);
  }
  const audit = [
    ...auditEntries(job.generation_audit),
    {
      stage: "lesson_assembly",
      model: "deterministic",
      repaired: false,
    } as GenerationAuditEntry,
  ];
  const lesson = assemblePlayableLesson({
    topic: job.topic,
    level: job.jlpt_level,
    draft: job.story_draft as unknown as StoryDraft,
    library,
    groups,
    audit,
  });
  const issues = playableLessonPackageIssues(lesson);
  if (issues.length > 0) {
    const groupsToInvalidate = [
      ...new Set(
        issues.flatMap((issue) => {
          const group = groupForPackageIssue(issue);
          return group ? [group] : [];
        }),
      ),
    ];
    if (groupsToInvalidate.length > 0) {
      for (const group of groupsToInvalidate) {
        await invalidateGroup(admin, job, group, issues.join(" "));
      }
      return finishStage(admin, job, "activity_groups", 78, {
        last_action: "invalidated_checkpoint",
      });
    }
    if (
      issues.some((issue) =>
        /story|lesson requires non-empty (title|japaneseTitle|summary)/iu.test(
          issue,
        ),
      )
    ) {
      return finishStage(admin, job, "story_building", 10, {
        lesson_plan: null,
        story_draft: null,
        library_snapshot: null,
        lesson_package: null,
        vocabulary_kanji_group: null,
        grammar_reading_group: null,
        communication_group: null,
        completed_groups: [],
        failed_groups: [],
        group_attempts: {},
        last_action: "invalidated_checkpoint",
      });
    }
    if (issues.some((issue) => /kanji|vocabulary|grammar/iu.test(issue))) {
      return finishStage(admin, job, "library_resolution", 78, {
        library_snapshot: null,
        lesson_package: null,
        last_action: "invalidated_checkpoint",
      });
    }
    throw Object.assign(
      new Error(
        `Playable lesson package validation failed: ${issues.join(" ")}`,
      ),
      { code: "NONRETRYABLE_CONTENT" },
    );
  }
  return finishStage(admin, job, "lesson_saving", 84, {
    lesson_package: lesson as unknown as Json,
    generation_audit: audit as unknown as Json,
  });
}

async function processLessonSaving(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const validIds = await existingLibraryIds(
    admin,
    job.library_snapshot,
    checkpoints(job),
  );
  const libraryIssues = resolvedLibraryCheckpointIssues(
    job.library_snapshot,
    validIds,
  );
  if (libraryIssues.length > 0) {
    return finishStage(admin, job, "library_resolution", 78, {
      library_snapshot: null,
      lesson_package: null,
      last_action: "invalidated_checkpoint",
    });
  }
  const inspection = inspectPersistedActivityCheckpoints(
    checkpoints(job),
    validIds,
  );
  if (inspection.invalid.length > 0) {
    for (const invalid of inspection.invalid) {
      await invalidateGroup(admin, job, invalid.group, invalid.issues.join(" "));
    }
    return finishStage(admin, job, "activity_groups", 78, {
      lesson_package: null,
      last_action: "invalidated_checkpoint",
    });
  }
  if (inspection.missing.length > 0) {
    return finishStage(admin, job, "activity_groups", 78, {
      lesson_package: null,
      last_action: "invalidated_checkpoint",
    });
  }
  const lesson = job.lesson_package;
  const issues = playableLessonPackageIssues(lesson);
  if (issues.length > 0) {
    const group = issues
      .map(groupForPackageIssue)
      .find((value) => value !== null);
    if (group) {
      await invalidateGroup(admin, job, group, issues.join(" "));
      return finishStage(admin, job, "activity_groups", 78, {
        lesson_package: null,
      });
    }
    throw Object.assign(
      new Error(
        `Playable lesson package validation failed: ${issues.join(" ")}`,
      ),
      { code: "NONRETRYABLE_CONTENT" },
    );
  }
  try {
    const stored = await admin.rpc("store_generated_lesson_package_background", {
      p_request_id: job.request_id,
      p_package: lesson,
      p_generation_seconds: 0,
    });
    if (stored.error) {
      throw Object.assign(new Error(stored.error.message), {
        code: stored.error.code,
      });
    }
    const value = resultRecord(stored.data);
    const lessonId = text(value.lesson_id);
    const lessonVersionId = text(value.lesson_version_id);
    const assignmentId = text(value.assignment_id);
    if (!lessonId || !lessonVersionId) {
      throw new Error("The saved lesson identifiers were not returned.");
    }
    return finishStage(admin, job, "audio", 90, {
      lesson_id: lessonId,
      lesson_version_id: lessonVersionId,
      assignment_id: assignmentId,
      audio_status: "queued",
      lesson_package: null,
    });
  } catch (error) {
    const action = finalizationFailureAction(error);
    if (action.kind === "invalidate_group") {
      await invalidateGroup(
        admin,
        job,
        action.group as ActivityGroupName,
        error instanceof Error ? error.message : String(error),
      );
      return finishStage(admin, job, "activity_groups", 78, {
        lesson_package: null,
        last_action: "invalidated_checkpoint",
      });
    }
    if (action.kind === "fail_permanently") {
      throw Object.assign(
        error instanceof Error ? error : new Error(String(error)),
        { code: "NONRETRYABLE_CONTENT" },
      );
    }
    throw error;
  }
}

async function processAudio(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  if (!job.lesson_version_id) {
    throw new Error("The lesson version is missing before audio preparation.");
  }
  const startedAt = Date.now();
  const attempt = numericAttempt(job.stage_attempts, "audio");
  try {
    // Reading and Listening exist by now and their Japanese is final, so this
    // is where their words become tappable — alongside audio, where nothing
    // downstream is waiting on either.
    //
    // A lesson is still perfectly playable with untapped words, so a failure
    // here is recorded and stepped over rather than allowed to fail the audio
    // stage and with it the lesson.
    try {
      const mapped = await mapStoredLessonTerms(job.lesson_version_id, admin);
      if (mapped.listeningUpdated || mapped.readingUpdated) {
        console.info("Custom lesson tappable terms mapped.", {
          requestId: job.request_id,
          stage: "audio",
          listeningUpdated: mapped.listeningUpdated,
          readingUpdated: mapped.readingUpdated,
        });
      }
    } catch (termError) {
      console.error("Custom lesson tappable terms could not be mapped.", {
        requestId: job.request_id,
        stage: "audio",
        message:
          termError instanceof Error ? termError.message : "Unknown term mapping error",
      });
    }

    await prepareStoredLessonAudio(job.lesson_version_id, admin);
    return finishStage(admin, job, "completed", 100, {
      audio_status: "ready",
      audio_prepared_at: new Date().toISOString(),
      audio_error: null,
    });
  } catch (error) {
    const failure = classifyGenerationError(error);
    if (!failure.retryable || attempt >= MAX_STAGE_ATTEMPTS) {
      await claimedUpdate(admin, job, {
        status: "completed",
        current_stage: "completed",
        progress_percent: 100,
        audio_status: "failed",
        audio_error: failure.message.slice(0, 1_000),
        failure_classification: failure.classification,
        provider_request_id: failure.providerRequestId,
        worker_token: null,
        claimed_at: null,
        last_action: "audio_non_blocking_failure",
      });
      console.error(
        "Custom lesson audio failed without blocking the lesson.",
        {
          requestId: job.request_id,
          stage: "audio",
          group: null,
          attempt,
          errorClassification: failure.classification,
          providerRequestId: failure.providerRequestId,
          durationMs: Date.now() - startedAt,
          action: "audio_non_blocking_failure",
          message: failure.message,
        },
      );
      await saveGenerationTrace({
        trace: { requestId: job.request_id, stage: "audio" },
        name: "audio",
        eventType: "stage_failure",
        attempt,
        issues: [failure.message],
        metadata: {
          requestId: job.request_id,
          stage: "audio",
          group: null,
          attempt,
          errorClassification: failure.classification,
          providerRequestId: failure.providerRequestId,
          durationMs: Date.now() - startedAt,
          action: "audio_non_blocking_failure",
          permanent: true,
          lessonBlocking: false,
        },
      });
      return {
        claimed: true,
        requestId: job.request_id,
        status: "completed",
        lessonReady: true,
        audioStatus: "failed",
        retryable: false,
      };
    }
    return scheduleFailure({
      admin,
      job,
      stage: "audio",
      attempt,
      startedAt,
      error,
    });
  }
}

async function processClaimedStage(
  admin: AdminClient,
  job: ProgressiveLessonJob,
): Promise<CustomLessonWorkerResult> {
  const startedAt = Date.now();
  const stage = job.status;
  const attempt =
    stage === "activity_groups" ? 0 : numericAttempt(job.stage_attempts, stage);
  try {
    return await withGenerationTraceContext(
      {
        requestId: job.request_id,
        stage,
        attempt,
        resumed: job.last_action?.startsWith("resumed") === true,
      },
      async () => {
        if (stage === "story_building") return processStory(admin, job);
        if (stage === "vocabulary_enrichment") {
          return processVocabularyEnrichment(admin, job);
        }
        if (stage === "library_resolution") {
          return processLibraryResolution(admin, job);
        }
        if (stage === "activity_groups") {
          return processActivityGroup(admin, job);
        }
        if (stage === "final_validation") {
          return processFinalValidation(admin, job);
        }
        if (stage === "lesson_saving") return processLessonSaving(admin, job);
        if (stage === "audio") return processAudio(admin, job);
        throw new Error(`Unsupported claimed custom lesson stage ${stage}.`);
      },
    );
  } catch (error) {
    if (stage === "activity_groups") {
      const infrastructureAttempt =
        numericAttempt(job.group_attempts, "activity_infrastructure") + 1;
      await claimedUpdate(admin, job, {
        group_attempts: {
          ...(isRecord(job.group_attempts) ? job.group_attempts : {}),
          activity_infrastructure: infrastructureAttempt,
        },
      });
      return scheduleFailure({
        admin,
        job,
        stage,
        attempt: infrastructureAttempt,
        startedAt,
        error,
      });
    }
    return scheduleFailure({ admin, job, stage, attempt, startedAt, error });
  }
}

async function claimStage(
  admin: AdminClient,
  requestId?: string,
): Promise<ProgressiveLessonJob | null> {
  const claim = await admin.rpc("claim_custom_lesson_stage", {
    p_request_id: requestId ?? null,
  });
  if (claim.error) {
    throw Object.assign(new Error(claim.error.message), { code: claim.error.code });
  }
  return asJob(claim.data);
}

export async function processCustomLessonJobs(
  options: { requestId?: string; maxCycles?: number } = {},
): Promise<CustomLessonWorkerResult> {
  const admin = adminClient();
  const startedAt = Date.now();
  const cycles = Math.max(
    1,
    Math.min(options.maxCycles ?? DEFAULT_MAX_CYCLES, 3),
  );
  let latest: CustomLessonWorkerResult | null = null;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    if (Date.now() - startedAt >= SOFT_RUNTIME_LIMIT_MS) break;
    const job = await claimStage(admin, options.requestId);
    if (!job) break;
    latest = await processClaimedStage(admin, job);
    if (
      latest.status === "retryable_failure" ||
      latest.status === "permanent_failure" ||
      latest.status === "completed"
    ) {
      break;
    }
  }
  return (
    latest ?? {
      claimed: false,
      requestId: options.requestId ?? null,
      status: "idle",
      lessonReady: false,
    }
  );
}
