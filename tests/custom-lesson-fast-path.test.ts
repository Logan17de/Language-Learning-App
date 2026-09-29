import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fastPath = readFileSync("lib/custom-lessons/fast-path.ts", "utf8");
const generateRoute = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const workerRoute = readFileSync("app/api/internal/custom-lessons/process/route.ts", "utf8");
const completionRoute = readFileSync("app/api/custom-lessons/complete/route.ts", "utf8");

describe("custom lesson fast path", () => {
  it("chains persisted stages immediately instead of waiting for cron between checkpoints", () => {
    expect(fastPath).toContain("MAX_FAST_PATH_STAGES = 16");
    expect(fastPath).toContain("processCustomLessonJobs({");
    expect(fastPath).toContain("maxCycles: 1");
    expect(fastPath).toContain("minimumBudgetForNextStage");
    expect(fastPath).toContain('status === "activity_groups"');
    expect(fastPath).toContain("140_000");
  });

  it("stops the normal fast path after lesson storage so audio remains background work", () => {
    expect(fastPath).toContain('latest.status === "audio" && latest.lessonReady');
    expect(fastPath).toContain("deferAudio !== false");
    expect(generateRoute).toContain("processCustomLessonFastPath");
    expect(generateRoute).toContain("deferAudio: true");
    expect(workerRoute).toContain("processCustomLessonFastPath");
    expect(workerRoute).toContain("deferAudio: true");
  });

  it("keeps explicit audio retries single-stage while activity retries use the fast path", () => {
    expect(completionRoute).toContain('if (action === "audio")');
    expect(completionRoute).toContain("processCustomLessonJobs({ requestId, maxCycles: 1 })");
    expect(completionRoute).toContain("processCustomLessonFastPath({ requestId, deferAudio: true })");
  });
});
