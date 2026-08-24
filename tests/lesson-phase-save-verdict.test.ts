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

  it("keeps phase ordering, one section per pass", () => {
    const loop = sync.slice(sync.indexOf("async function runPendingSync"));
    expect(loop).toContain("break;");
  });

  it("names the reason when there is one", () => {
    expect(player).toContain("pendingLessonPhaseError(lesson.id)");
    expect(sync).toContain("This section was refused without a reason.");
  });
});
