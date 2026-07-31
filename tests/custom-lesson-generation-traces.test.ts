import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const traceStore = readFileSync(
  "lib/custom-lessons/generation-trace.ts",
  "utf8",
);
const openaiStructured = readFileSync(
  "lib/openai/structured-output.ts",
  "utf8",
);
const compatibility = readFileSync(
  "lib/gemini/structured-output.ts",
  "utf8",
);
const story = readFileSync(
  "lib/gemini/adaptive-story-generation.ts",
  "utf8",
);
const generateRoute = readFileSync(
  "app/api/custom-lessons/generate/route.ts",
  "utf8",
);
const completeRoute = readFileSync(
  "app/api/custom-lessons/complete/route.ts",
  "utf8",
);
const tracesRoute = readFileSync(
  "app/api/custom-lessons/traces/route.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260731060000_custom_lesson_generation_traces.sql",
  "utf8",
);

describe("custom lesson generation traces", () => {
  it("stores exact model responses, validation issues, and repair prompts", () => {
    expect(openaiStructured).toContain('eventType: "initial_response"');
    expect(openaiStructured).toContain('eventType: "repair_response"');
    expect(openaiStructured).toContain("rawResponse: first.rawOutput");
    expect(openaiStructured).toContain("rawResponse: repaired.rawOutput");
    expect(openaiStructured).toContain("prompt: repairPrompt");
    expect(openaiStructured).toContain("initialIssues: issues");
    expect(openaiStructured).toContain("previousResponse: first.value");
    expect(openaiStructured).toContain('eventType: "generation_failed"');
  });

  it("propagates the request id into story and background activity calls", () => {
    expect(traceStore).toContain("AsyncLocalStorage");
    expect(traceStore).toContain("withGenerationTraceContext");
    expect(story).toContain("requestId: string");
    expect(story).toContain('stage: "story"');
    expect(generateRoute).toContain("requestId: generation.requestId");
    expect(generateRoute).toContain("withGenerationTraceContext");
    expect(completeRoute).toContain("withGenerationTraceContext");
  });

  it("records transient retries without turning trace failures into lesson failures", () => {
    expect(compatibility).toContain('eventType: "transport_retry"');
    expect(traceStore).toContain("Custom lesson generation trace could not be saved");
    expect(traceStore).not.toContain("throw saved.error");
  });

  it("keeps traces private to the lesson owner and exposes an authenticated reader", () => {
    expect(migration).toContain("custom_lesson_generation_traces");
    expect(migration).toContain("Learners can read their own generation traces");
    expect(migration).toContain("request.user_id = auth.uid()");
    expect(migration).toContain("raw_response text");
    expect(migration).toContain("issues text[]");
    expect(tracesRoute).toContain('authorize("learn")');
    expect(tracesRoute).toContain('from("custom_lesson_generation_traces")');
    expect(tracesRoute).toContain('.eq("request_id", requestId)');
  });
});
