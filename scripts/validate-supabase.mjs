import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const migrationDir = join(process.cwd(), "supabase", "migrations");
const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
if (files.length < 3) throw new Error("Expected schema, RLS, and functions migrations.");

const sql = (await Promise.all(files.map((file) => readFile(join(migrationDir, file), "utf8")))).join("\n").toLowerCase();
const requiredTables = [
  "profiles", "user_preferences", "user_settings", "user_subscriptions",
  "curriculum_levels", "curriculum_items", "grammar_records", "kanji_records", "vocabulary_records",
  "lessons", "lesson_versions", "lesson_story_lines", "lesson_vocabulary", "lesson_grammar",
  "lesson_reading_sections", "lesson_listening_activities", "lesson_speaking_activities",
  "lesson_review_activities", "lesson_assets", "image_assets", "audio_assets",
  "lesson_sessions", "lesson_activity_answers", "lesson_events", "lesson_completions",
  "learner_mastery", "review_queue", "review_sessions", "review_activity_answers", "review_results",
  "achievements", "user_achievements", "weekly_activity", "custom_lesson_requests",
  "generated_lesson_jobs", "lesson_validation_runs", "lesson_validation_checks",
  "lesson_reports", "support_tickets", "support_messages", "audit_logs", "feature_flags",
  "service_status", "cost_records", "reward_ledger",
  "lesson_assignments",
];

const missingTables = requiredTables.filter((table) => !sql.includes(`create table public.${table}`));
const hasDynamicRlsLoop = sql.includes("execute format('alter table public.%i enable row level security'");
const missingRls = requiredTables.filter((table) =>
  !sql.includes(`alter table public.${table} enable row level security`)
  && !(hasDynamicRlsLoop && sql.includes(`'${table}'`))
);
const requiredFunctions = [
  "complete_lesson_session", "complete_review_session", "claim_lesson_reward",
  "claim_review_reward", "publish_lesson_version", "reset_learner_progress",
  "save_lesson_draft",
  "assign_next_lesson", "begin_custom_lesson_generation", "store_generated_lesson_package",
  "begin_custom_lesson_generation_v2", "enrich_custom_lesson_library",
];
const missingFunctions = requiredFunctions.filter((name) => !sql.includes(`function public.${name}`));

const errors = [];
if (missingTables.length) errors.push(`Missing tables: ${missingTables.join(", ")}`);
if (missingRls.length) errors.push(`Missing RLS: ${missingRls.join(", ")}`);
if (missingFunctions.length) errors.push(`Missing functions: ${missingFunctions.join(", ")}`);
if (/to authenticated\s+using\s*\(\s*true\s*\)/i.test(sql)) {
  errors.push("Found an unrestricted authenticated SELECT policy.");
}
if (!sql.includes("unique (reward_type, source_id)")) errors.push("Missing reward ledger idempotency constraint.");
if (!sql.includes("lesson_version_id uuid not null")) errors.push("Lesson sessions are not pinned to a version.");

if (errors.length) throw new Error(errors.join("\n"));
console.log(`Validated ${files.length} migrations, ${requiredTables.length} tables, RLS coverage, and ${requiredFunctions.length} trusted functions.`);
