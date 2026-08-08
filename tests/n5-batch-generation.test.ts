import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808103000_n5_batch_lesson_generation.sql",
  "utf8",
);
const legacyEngine = readFileSync("lib/admin-lessons/n5-batch-generation.ts", "utf8");
const engine = readFileSync("lib/admin-lessons/jlpt-batch-generation.ts", "utf8");
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

describe("JLPT offline lesson Batch staging", () => {
  it("preserves provider and model output before repair", () => {
    expect(migration).toContain("raw_provider_line jsonb");
    expect(migration).toContain("raw_response text");
    expect(migration).toContain("parsed_lesson jsonb");
    expect(migration).toContain("edited_lesson jsonb");
    expect(migration).toContain("prompt text not null");
    expect(migration).toContain("request_body jsonb not null");
    expect(migration).toContain("unmatched_provider_lines jsonb");
    expect(migration).toContain(
      "revoke all on table public.lesson_generation_requests from public, anon, authenticated",
    );
  });

  it("supports selectable Batch generation from N5 through N1", () => {
    expect(engine).toContain('["N5", "N4", "N3", "N2", "N1"]');
    expect(adminRoute).toContain("normalizeBatchLevel(body.level)");
    expect(adminRoute).toContain("submitLessonBatch({ count, level, userId: auth.userId })");
    expect(workspace).toContain('const jlptLevels = ["N5", "N4", "N3", "N2", "N1"]');
    expect(workspace).toContain('body: JSON.stringify({ action: "create", count, level })');
    expect(workspace).toContain('min={1} max={100}');
  });

  it("keeps five-kanji sets unique while balancing reusable grammar patterns", () => {
    expect(engine).toContain('import { randomInt } from "node:crypto"');
    expect(engine).toContain("TARGET_KANJI_COUNT = 5");
    expect(engine).toContain("TARGET_GRAMMAR_COUNT = 3");
    expect(engine).toContain('select("target_kanji,target_grammar")');
    expect(engine).toContain('.eq("jlpt_level", level)');
    expect(engine).toContain("usedKanjiSets.add(targetSetSignature(kanji))");
    expect(engine).toContain("if (!input.used.has(signature))");
    expect(engine).toContain("chooseBalancedGrammarSet");
    expect(engine).toContain("const grammarUsage = new Map");
    expect(engine).toContain("for (const pattern of new Set(strings(row.target_grammar)))");
    expect(engine).toContain("minimumUsage");
    expect(engine).not.toContain("usedGrammarSets");
    expect(capacity).toContain("Grammar patterns may repeat with different kanji sets");
  });

  it("preflights exact five-kanji capacity before creating a Batch", () => {
    expect(capacity).toContain("combinationCount");
    expect(capacity).toContain("maxSelectableLessons");
    expect(adminRoute).toContain("getLessonTargetCapacity(level)");
    expect(adminRoute).toContain("assertLessonTargetCapacity");
    expect(adminRoute).toContain("status: 409");
  });

  it("keeps target comparison order-independent and validates the selected level", () => {
    expect(engine).toContain('sort((left, right) => left.localeCompare(right, "ja"))');
    expect(engine).toContain("targetSetSignature(left) === targetSetSignature(right)");
    expect(engine).toContain("Generated lesson level must remain ${level}.");
    expect(engine).toContain("Target kanji mismatch");
    expect(engine).toContain("Target grammar mismatch");
    expect(engine).toContain("is missing from the main story");
    expect(engine).toContain("is not tested in grammarQuestions");
  });

  it("submits complete lessons through the Responses Batch endpoint", () => {
    expect(engine).toContain('url: "/v1/responses"');
    expect(engine).toContain('endpoint: "/v1/responses"');
    expect(engine).toContain('form.append("purpose", "batch")');
    expect(engine).toContain("buildOpenAIResponsesRequest");
    expect(engine).toContain("COMPLETE_LESSON_CHAT_PROMPT");
    expect(engine).toContain("Choose an original, natural ${level}-appropriate topic yourself");
  });

  it("keeps failed output repairable instead of retrying it away", () => {
    expect(engine).toContain('status: "api_failed"');
    expect(engine).toContain('status: errors.length ? "invalid" : "valid"');
    const manualStart = engine.indexOf("export async function saveManualGenerationLesson");
    const manualBlock = engine.slice(manualStart);
    expect(manualBlock).toContain("edited_lesson");
    expect(manualBlock).not.toContain("raw_response:");
    expect(workspace).toContain("Original raw model response");
    expect(workspace).toContain("Save + validate");
    expect(legacyEngine).toContain("importValidGenerationRequests");
  });

  it("keeps all generation controls owner-authorized", () => {
    expect(adminRoute).toContain('authorize("manage_content")');
    expect(requestRoute).toContain('authorize("manage_content")');
    expect(workerRoute).toContain("LESSON_GENERATION_WORKER_SECRET");
    expect(workerRoute).toContain("CRON_SECRET");
    expect(sidebar).toContain("JLPT Batch Lessons");
  });
});
