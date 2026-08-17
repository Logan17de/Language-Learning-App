import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyGenerationError,
  finalizationFailureAction,
  incompleteGrammarTeachingRecord,
  incompleteKanjiTeachingRecord,
  retryBackoffMs,
  staleWorkerClaim,
} from "@/lib/custom-lessons/reliability";
import {
  partitionNonEmptySentences,
  partitionReadingPassage,
} from "@/lib/custom-lessons/reading-lines";
import { customLessonWorkerAuthorized } from "@/lib/custom-lessons/worker-authorization";

const migration = readFileSync(
  "supabase/migrations/20260810090000_stage_based_custom_lesson_jobs.sql",
  "utf8",
);
const statusRoute = readFileSync("app/api/custom-lessons/status/route.ts", "utf8");
const workerRoute = readFileSync("app/api/internal/custom-lessons/process/route.ts", "utf8");
const workerAuthorization = readFileSync(
  "lib/custom-lessons/worker-authorization.ts",
  "utf8",
);
const generateRoute = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const schedulerMigration = readFileSync(
  "supabase/migrations/20260810100000_supabase_custom_lesson_scheduler.sql",
  "utf8",
);

describe("custom lesson retry reliability", () => {
  it("classifies transient failures and applies bounded exponential backoff", () => {
    expect(classifyGenerationError(new Error("Provider timed out with status 503"))).toMatchObject({
      classification: "transient",
      retryable: true,
    });
    expect([1, 2, 3, 8].map((attempt) => retryBackoffMs(attempt, 0))).toEqual([
      2_000, 4_000, 8_000, 120_000,
    ]);
    expect(retryBackoffMs(20, 1)).toBe(120_000);
  });

  it("fails authorization, configuration, and missing catalogs without pointless retries", () => {
    expect(classifyGenerationError(Object.assign(new Error("Service role required"), { code: "42501" })).retryable)
      .toBe(false);
    expect(classifyGenerationError(new Error("OPENAI_API_KEY is not configured."))).toMatchObject({
      classification: "configuration",
      retryable: false,
    });
    expect(classifyGenerationError(new Error("Import the N2 kanji and grammar catalogs before generating lessons.")))
      .toMatchObject({ classification: "missing_catalog", retryable: false });
  });

  it("retries unchanged packages only for transient infrastructure errors", () => {
    expect(finalizationFailureAction(new Error("Database connection timed out"))).toEqual({ kind: "retry_same_package" });
    expect(finalizationFailureAction(Object.assign(
      new Error("Invalid playable lesson package: vocabularyQuestions must contain 13 items"),
      { code: "22023" },
    ))).toEqual({ kind: "invalidate_group", group: "vocabulary_and_kanji" });
    expect(finalizationFailureAction(Object.assign(
      new Error("Invalid playable lesson package: unknown content"),
      { code: "22023" },
    ))).toEqual({ kind: "fail_permanently" });
  });

  it("recovers stale claims and prevents concurrent duplicate claims", () => {
    const now = Date.parse("2026-08-10T12:00:00Z");
    expect(staleWorkerClaim("2026-08-10T11:51:59Z", now)).toBe(true);
    expect(staleWorkerClaim("2026-08-10T11:55:00Z", now)).toBe(false);
    expect(migration).toContain("interval '8 minutes'");
    expect(migration).toContain("coalesce(candidate.claimed_at, candidate.updated_at)");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("worker_token = gen_random_uuid()");
    expect(migration).toContain("where request_id = p_request_id and worker_token = p_worker_token");
  });

  it("reports story-building status before a story draft exists", () => {
    expect(migration).toContain("'queued',\n    'queued',\n    0");
    expect(statusRoute).toContain("if (row.story_draft && row.library_snapshot)");
    expect(statusRoute).toContain("storyReady: Boolean(story)");
    expect(statusRoute).toContain("progressPercent");
  });

  it("authorizes both scheduler and manual worker secrets without exposing the route", () => {
    const environment = {
      CUSTOM_LESSON_WORKER_SECRET: "scheduler-secret-value",
      CRON_SECRET: "manual-secret-value",
    };
    expect(customLessonWorkerAuthorized(null, environment)).toBe(false);
    expect(customLessonWorkerAuthorized("Bearer wrong-secret", environment)).toBe(false);
    expect(customLessonWorkerAuthorized("scheduler-secret-value", environment)).toBe(false);
    expect(customLessonWorkerAuthorized("Bearer scheduler-secret-value", environment)).toBe(true);
    expect(customLessonWorkerAuthorized("Bearer manual-secret-value", environment)).toBe(true);
    expect(workerRoute).toContain("customLessonWorkerAuthorized");
    expect(workerAuthorization).toContain("timingSafeEqual");
    expect(migration).toContain("Service role required");
  });

  it("uses one idempotent Supabase schedule with Vault-backed worker credentials", () => {
    expect(existsSync("vercel.json")).toBe(false);
    expect(schedulerMigration).toContain("create extension if not exists pg_cron");
    expect(schedulerMigration).toContain("create extension if not exists pg_net");
    expect(schedulerMigration).toContain("create extension if not exists supabase_vault");
    expect(schedulerMigration).toContain("custom_lesson_worker_url");
    expect(schedulerMigration).toContain("custom_lesson_worker_secret");
    expect(schedulerMigration).toContain("perform cron.unschedule(v_existing_job_id)");
    expect(schedulerMigration).toContain("'custom-lesson-worker-every-minute'");
    expect(schedulerMigration).toContain("'* * * * *'");
    expect(schedulerMigration).toContain("timeout_milliseconds := 285000");
    expect(schedulerMigration).toContain("'Authorization', 'Bearer ' || v_worker_secret");
  });

  it("surfaces missing scheduler configuration before creating a durable job", () => {
    const diagnosticsCall = generateRoute.indexOf(
      "await getCustomLessonSchedulerDiagnostics()",
    );
    const beginCall = generateRoute.indexOf(
      'client.rpc("begin_custom_lesson_generation_v4"',
    );
    expect(diagnosticsCall).toBeGreaterThan(-1);
    expect(diagnosticsCall).toBeLessThan(beginCall);
    expect(generateRoute).toContain("CUSTOM_LESSON_SCHEDULER_UNAVAILABLE");
    expect(workerRoute).toContain('searchParams.get("diagnostics") === "1"');
    expect(schedulerMigration).toContain("custom_lesson_scheduler_diagnostics");
    expect(schedulerMigration).toContain("Custom lesson scheduler");
  });

  it("never creates empty Japanese reading lines when the model returns fewer sentences", () => {
    expect(partitionNonEmptySentences([" one ", "", " two "], 6)).toEqual(["one", "two"]);
    const lines = partitionReadingPassage({
      japanese: "一文です。二文です。",
      english: "First. Second.",
      maximumLines: 6,
    });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.japanese.trim().length > 0)).toBe(true);
    expect(lines.every((line) => line.english.trim().length > 0)).toBe(true);
  });

  it("detects incomplete catalog teaching records", () => {
    expect(incompleteKanjiTeachingRecord({
      character: "日", meanings: [], readings: [], example_words: [],
    })).toBe(true);
    expect(incompleteKanjiTeachingRecord({
      character: "日", meanings: ["day"], readings: ["にち"], example_words: ["日本"],
    })).toBe(false);
    expect(incompleteGrammarTeachingRecord({
      pattern: "です", meaning: "", formation: "", usage_notes: "", example_sentences: [],
    })).toBe(true);
  });
});
