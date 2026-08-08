import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808103000_n5_batch_lesson_generation.sql",
  "utf8",
);
const engine = readFileSync("lib/admin-lessons/n5-batch-generation.ts", "utf8");
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

describe("N5 offline lesson Batch staging", () => {
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

  it("submits complete lessons through the Responses Batch endpoint", () => {
    expect(engine).toContain('url: "/v1/responses"');
    expect(engine).toContain('endpoint: "/v1/responses"');
    expect(engine).toContain('form.append("purpose", "batch")');
    expect(engine).toContain("buildOpenAIResponsesRequest");
    expect(engine).toContain("COMPLETE_LESSON_CHAT_PROMPT");
    expect(engine).toContain("Choose an original, natural N5-appropriate topic yourself");
  });

  it("locks curriculum targets while letting the model choose the topic", () => {
    expect(engine).toContain("TARGET_KANJI_COUNT = 5");
    expect(engine).toContain("TARGET_GRAMMAR_COUNT = 3");
    expect(engine).toContain("Target kanji mismatch");
    expect(engine).toContain("Target grammar mismatch");
    expect(engine).toContain("is missing from the main story");
    expect(engine).toContain("is not tested in grammarQuestions");
    expect(engine).toContain("pairScore");
  });

  it("keeps failed output repairable instead of retrying it away", () => {
    expect(engine).toContain('status: "api_failed"');
    expect(engine).toContain('status: errors.length ? "invalid" : "valid"');
    const manualStart = engine.indexOf("export async function saveManualGenerationLesson");
    const importStart = engine.indexOf("export async function importValidGenerationRequests");
    const manualBlock = engine.slice(manualStart, importStart);
    expect(manualBlock).toContain("edited_lesson");
    expect(manualBlock).not.toContain("raw_response:");
    expect(workspace).toContain("Original raw model response");
    expect(workspace).toContain("Save + validate");
  });

  it("keeps all generation controls owner-authorized", () => {
    expect(adminRoute).toContain('authorize("manage_content")');
    expect(requestRoute).toContain('authorize("manage_content")');
    expect(workerRoute).toContain("LESSON_GENERATION_WORKER_SECRET");
    expect(workerRoute).toContain("CRON_SECRET");
    expect(sidebar).toContain("/admin/lessons/batch-generate");
  });
});
