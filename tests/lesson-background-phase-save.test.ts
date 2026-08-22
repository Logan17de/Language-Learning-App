import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const queue = readFileSync("lib/sync/offline-queue.ts", "utf8");

describe("non-blocking phase mastery persistence", () => {
  it("queues a finished section before advancing the visible lesson", () => {
    const optimisticBranch = player.slice(
      player.indexOf("if (!skipped && !lastPhase)"),
      player.indexOf("setIsCommitting(true)", player.indexOf("if (!skipped && !lastPhase)")),
    );
    expect(optimisticBranch).toContain("queueLessonPhaseCompletion(");
    expect(optimisticBranch).toContain("updateSession({");
    expect(optimisticBranch.indexOf("queueLessonPhaseCompletion(")).toBeLessThan(
      optimisticBranch.indexOf("updateSession({"),
    );
    expect(optimisticBranch).not.toContain("await queueLessonPhaseCompletion");
  });

  it("keeps failed commits durable and prevents later checkpoints overtaking them", () => {
    expect(queue).toContain('"lesson_phase_commit"');
    expect(sync).toContain("hasPendingLessonPhaseCommit(lesson.id)");
    expect(sync).toContain("Preserve phase ordering");
    expect(sync).toContain("break;");
    expect(player).toContain("Retry save");
    expect(player).toContain("safe on this device");
  });

  it("waits for all queued phases before canonical lesson completion", () => {
    expect(player).toContain("flushPendingLessonPhaseCommits(lesson.id)");
    expect(player).toContain("syncLessonCompletion(");
    expect(sync).toContain("if (hasPendingLessonPhaseCommit(lesson.id)) return safeFallback");
  });
});
