import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stagingMigration = readFileSync(
  "supabase/migrations/20260808103000_n5_batch_lesson_generation.sql",
  "utf8",
);
const reservationMigration = readFileSync(
  "supabase/migrations/20260808123000_lesson_generation_target_reservations.sql",
  "utf8",
);
const engine = readFileSync("lib/admin-lessons/lesson-batch-generation.ts", "utf8");
const contract = readFileSync("lib/admin-lessons/lesson-generation-contract.ts", "utf8");
const staging = readFileSync("lib/admin-lessons/lesson-generation-staging.ts", "utf8");
const legacyN5 = readFileSync("lib/admin-lessons/n5-batch-generation.ts", "utf8");
const legacyJlpt = readFileSync("lib/admin-lessons/jlpt-batch-generation.ts", "utf8");
const capacity = readFileSync("lib/admin-lessons/lesson-generation-capacity.ts", "utf8");
const adminRoute = readFileSync("app/api/admin/lesson-generation/route.ts", "utf8");
const requestRoute = readFileSync(
  "app/api/admin/lesson-generation/requests/[requestId]/route.ts",
  "utf8",
);
const workerRoute = readFileSync(
  "app/api/internal/lesson-generation/sync/route.ts",
  "utf8",
);
const workspace = readFileSync(
  "components/admin/lessons/n5-batch-generation.tsx",
  "utf8",
);
const sidebar = readFileSync("components/admin/admin-sidebar.tsx", "utf8");

describe("canonical JLPT offline lesson Batch generation", () => {
  it("preserves raw provider/model output and manual repair separately", () => {
    expect(stagingMigration).toContain("raw_provider_line jsonb");
    expect(stagingMigration).toContain("raw_response text");
    expect(stagingMigration).toContain("parsed_lesson jsonb");
    expect(stagingMigration).toContain("edited_lesson jsonb");
    expect(stagingMigration).toContain("prompt text not null");
    expect(stagingMigration).toContain("request_body jsonb not null");
    expect(stagingMigration).toContain("unmatched_provider_lines jsonb");

    const rawSave = engine.indexOf("const rawSaved = await admin");
    const parse = engine.indexOf("parsed = parseGeneratedLesson(extracted.output)");
    expect(rawSave).toBeGreaterThan(0);
    expect(parse).toBeGreaterThan(rawSave);

    const manualStart = staging.indexOf("export async function saveManualGenerationLesson");
    const importStart = staging.indexOf("export async function importValidGenerationRequests");
    const manualBlock = staging.slice(manualStart, importStart);
    expect(manualBlock).toContain("edited_lesson");
    expect(manualBlock).not.toContain("raw_response:");
    expect(manualBlock).not.toContain("raw_provider_line:");
  });

  it("supports selectable generation from N5 through N1 and 1-100 lessons", () => {
    expect(contract).toContain('["N5", "N4", "N3", "N2", "N1"]');
    expect(contract).toContain("MAX_BATCH_LESSONS = 100");
    expect(adminRoute).toContain("normalizeBatchLevel(body.level)");
    expect(adminRoute).toContain("submitLessonBatch({ count, level, userId: auth.userId })");
    expect(workspace).toContain('const jlptLevels = ["N5", "N4", "N3", "N2", "N1"]');
    expect(workspace).toContain('body: JSON.stringify({ action: "create", count, level })');
    expect(workspace).toContain('min={1} max={100}');
  });

  it("selects finite targets from catalogs rather than enrichment records", () => {
    expect(engine).toContain('.from("kanji_catalog")');
    expect(engine).toContain('.from("grammar_catalog")');
    expect(engine).toContain('.eq("active", true)');
    expect(engine).not.toContain('.from("kanji_records")');
    expect(engine).not.toContain('.from("grammar_records")');
    expect(capacity).toContain('.from("kanji_catalog")');
    expect(capacity).toContain('.from("lesson_generation_kanji_reservations")');
    expect(capacity).not.toContain('.from("kanji_records")');
  });

  it("makes the exact five-kanji set a race-safe permanent DB reservation", () => {
    expect(reservationMigration).toContain("lesson_generation_kanji_signature");
    expect(reservationMigration).toContain("order by value collate \"C\"");
    expect(reservationMigration).toContain("unique (jlpt_level, signature)");
    expect(reservationMigration).toContain("reserve_lesson_generation_kanji_set");
    expect(reservationMigration).toContain("on conflict (jlpt_level, signature) do nothing");
    expect(reservationMigration).toContain("from public.lesson_generation_requests request");
    expect(reservationMigration).not.toMatch(/from public\.lesson_generation_requests request[\s\S]*where request\.status/u);
    expect(engine).toContain('admin.rpc("reserve_lesson_generation_kanji_set"');
    expect(engine).toContain("if (reserved.data === true) return candidate");
  });

  it("keeps grammar reusable but balanced and distinct inside each lesson", () => {
    expect(engine).toContain("chooseBalancedGrammarSet");
    expect(engine).toContain("const available = [...input.keys]");
    expect(engine).toContain("available.splice(available.indexOf(chosen), 1)");
    expect(engine).toContain("const grammarUsage = new Map");
    expect(engine).toContain("minimumUsage");
    expect(engine).toContain('select("target_grammar")');
    expect(engine).not.toContain("usedGrammarSets");
    expect(capacity).toContain("Grammar patterns may repeat with different kanji sets");
  });

  it("uses one strict nested Structured Output contract plus deterministic validation", () => {
    expect(engine).toContain("COMPLETE_LESSON_BATCH_SCHEMA");
    expect(engine).toContain("strictSchema: true");
    expect(contract).toContain("additionalProperties: false");
    expect(contract).toContain("vocabularyQuestionSchema");
    expect(contract).toContain("grammarQuestionSchema");
    expect(contract).toContain("listeningSchema");
    expect(contract).toContain("reviewSchema");
    expect(contract).toContain("validateCompleteLessonImport(input.value).errors");
    expect(contract).toContain("Target kanji mismatch");
    expect(contract).toContain("Target grammar mismatch");
    expect(contract).toContain("is missing from the main story");
    expect(contract).toContain("is not tested in grammarQuestions");
  });

  it("tells the model target kanji are focus characters, not a whitelist", () => {
    expect(contract).toContain("These five characters are focus targets, NOT a whitelist");
    expect(contract).toContain("combine them into natural words or compounds");
    expect(contract).toContain("use any other kanji that is natural and appropriate");
    expect(contract).toContain("Do not add supporting/non-target kanji to the top-level kanji array");
  });

  it("submits through the real Responses Batch endpoint", () => {
    expect(engine).toContain('url: "/v1/responses"');
    expect(engine).toContain('endpoint: "/v1/responses"');
    expect(engine).toContain('form.append("purpose", "batch")');
    expect(engine).toContain('completion_window: "24h"');
    expect(engine).toContain("buildOpenAIResponsesRequest");
  });

  it("retires duplicate provider/scheduler implementations", () => {
    expect(legacyN5).toContain("Compatibility facade");
    expect(legacyJlpt).toContain("Compatibility facade");
    expect(legacyN5).not.toContain("OPENAI_API_KEY");
    expect(legacyN5).not.toContain('openAIJson("/batches"');
    expect(legacyN5).not.toContain("kanji_records");
    expect(legacyJlpt).not.toContain("OPENAI_API_KEY");
    expect(legacyJlpt).not.toContain('openAIJson("/batches"');
    expect(adminRoute).toContain('from "@/lib/admin-lessons/lesson-batch-generation"');
    expect(requestRoute).toContain('from "@/lib/admin-lessons/lesson-generation-staging"');
    expect(workerRoute).toContain('from "@/lib/admin-lessons/lesson-batch-generation"');
  });

  it("keeps generation controls owner-authorized", () => {
    expect(adminRoute).toContain('authorize("manage_content")');
    expect(requestRoute).toContain('authorize("manage_content")');
    expect(workerRoute).toContain("LESSON_GENERATION_WORKER_SECRET");
    expect(workerRoute).toContain("CRON_SECRET");
    expect(sidebar).toContain("JLPT Batch Lessons");
  });
});
