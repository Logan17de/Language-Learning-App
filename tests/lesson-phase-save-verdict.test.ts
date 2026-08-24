import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");

/**
 * A section that was never attempted must not be reported as one that failed.
 * The save warning is the only signal a learner gets, so a false one sends them
 * pressing Retry against nothing.
 */
describe("the save verdict reflects an actual attempt", () => {
  it("does not trust a pass that may predate this section", () => {
    // retryPendingSync joins a pass already in flight, and a pass stops after
    // the first queued phase to preserve order.
    expect(sync).toContain("stillQueued() ? retryPendingSync() : undefined");
    expect(sync).toContain("const stillQueued = () =>");
  });

  it("only reports success when the section has left the queue", () => {
    expect(sync).toContain(".then(() => !stillQueued())");
  });

  it("holds back later sections of the same lesson, and only that lesson", () => {
    // One section that will not commit used to stop the queue outright, so
    // every save for every lesson stayed unsent behind it.
    const loop = sync.slice(sync.indexOf("async function runPendingSync"));
    expect(loop).toContain("const blocked = new Set<string>()");
    expect(loop).toContain("if (blocked.has(lessonId)) continue;");
    expect(loop).toContain("blocked.add(lessonId);");
    // The whole-queue stop is gone.
    expect(loop).not.toContain("break;");
  });

  it("makes a stuck lesson hold its own checkpoints back too", () => {
    const loop = sync.slice(sync.indexOf("async function runPendingSync"));
    expect(loop).toContain(
      "if (blocked.has(queuedLessonId(operation.dedupeKey))) continue;",
    );
  });

  it("reads the lesson out of the queue key", () => {
    expect(sync).toContain("function queuedLessonId(dedupeKey: string)");
    expect(sync).toContain('dedupeKey.split(":")[1]');
  });

  it("names the reason when there is one", () => {
    expect(player).toContain("pendingLessonPhaseError(lesson.id)");
    expect(sync).toContain("This section was refused without a reason.");
  });
});
