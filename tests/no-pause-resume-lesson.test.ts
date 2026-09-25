import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const learn = readFileSync("components/learn/lesson-library.tsx", "utf8");
const home = readFileSync("components/home/home-dashboard.tsx", "utf8");
const queue = readFileSync("lib/sync/offline-queue.ts", "utf8");
const backendStore = readFileSync("store/backend-lesson-store.ts", "utf8");

/**
 * This suite previously asserted that lessons could not be paused or resumed
 * at all. That product stance was replaced by the authoritative /learn
 * contract: leaving is non-destructive, Resume is a first-class action, and
 * resume is phase-atomic rather than a mid-question pause. The tests below
 * cover that current contract.
 */
describe("leaving and resuming a lesson", () => {
  it("warns that leaving restarts only the unfinished phase", () => {
    expect(player).toContain("Leave for now?");
    expect(player).toContain("Completed phases stay saved.");
    expect(player).toContain("restart from its first activity");
    expect(player).toContain("Stay in lesson");
    expect(player).toContain("Save & leave");
    // Leaving is not a pause, and it is not an abandon.
    expect(player).not.toContain("Pause this lesson?");
    expect(player).not.toContain("/learn?paused=1");
  });

  it("does not consume or refund a daily generation when the learner leaves", () => {
    // The sentence wraps in the JSX source.
    expect(player).toContain("Leaving does not");
    expect(player).toContain("refund or consume another daily lesson.");
    // The session is checkpointed, never abandoned, so it stays resumable.
    expect(player).not.toContain("lessonSessionRepository.abandonActive");
    expect(player).not.toContain("discardLessonSyncOperations");
  });

  it("saves a phase-atomic checkpoint on the way out", () => {
    const leave = player.slice(
      player.indexOf("async function leaveLesson()"),
      player.indexOf("return (", player.indexOf("async function leaveLesson()")),
    );
    expect(leave).toContain("restartIncompleteLessonPhase({");
    expect(leave).toContain("saveLessonSession(checkpoint)");
    expect(leave).toContain("syncLessonProgress(lesson, checkpoint)");
    expect(leave).toContain('router.replace("/learn")');
  });

  it("offers Resume and Start new as separate actions on /learn", () => {
    expect(learn).toContain("Resume lesson");
    expect(learn).toContain("Start new lesson");
    expect(learn).toContain(
      "const currentLesson = resumableLesson\n    ? null\n    : currentLessonAction(creationState)",
    );
    // Resume never spends today's allowance.
    expect(learn).toContain(
      "Resume remains available without consuming another lesson.",
    );
    // /learn now describes the flow without teaching the Free/Premium split -
    // that comparison lives on the subscription page. The Resume promise is
    // still stated, in learner-facing wording.
    expect(learn).toContain("Pick up where you left off");
    expect(learn).toContain(
      "coming back to an unfinished lesson never costs you a new one",
    );
  });

  it("keeps Home pointing at /learn without its own resume surface", () => {
    expect(home).toContain('href="/learn"');
    expect(home).not.toContain("Resume where you stopped");
    expect(backendStore).not.toContain("paused lesson");
  });

  it("still discards queued checkpoints when a lesson is genuinely dropped", () => {
    expect(queue).toContain("discardLessonSyncOperations");
  });
});
