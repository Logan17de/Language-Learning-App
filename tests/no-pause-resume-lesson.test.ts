import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const learn = readFileSync("components/learn/lesson-library.tsx", "utf8");
const home = readFileSync("components/home/home-dashboard.tsx", "utf8");
const repository = readFileSync(
  "lib/repositories/lesson-session-repository.ts",
  "utf8",
);
const queue = readFileSync("lib/sync/offline-queue.ts", "utf8");
const backendStore = readFileSync("store/backend-lesson-store.ts", "utf8");

describe("lesson pause/resume retirement", () => {
  it("warns before intentionally abandoning a lesson", () => {
    expect(player).toContain("Leave this lesson?");
    expect(player).toContain("AIko doesn&apos;t pause lessons");
    expect(player).toContain("Stay in lesson");
    expect(player).toContain("Leave lesson");
    expect(player).toContain("won&apos;t be assigned to you again");
    expect(player).not.toContain("Pause this lesson?");
    expect(player).not.toContain("Save and exit");
    expect(player).not.toContain("/learn?paused=1");
  });

  it("abandons the backend session and prevents queued checkpoints from resurrecting it", () => {
    expect(repository).toContain('status: "abandoned"');
    expect(player).toContain("lessonSessionRepository.abandonActive(lesson.id)");
    expect(queue).toContain("discardLessonSyncOperations");
    expect(player).toContain("discardLessonSyncOperations(lesson.id)");
    expect(player).toContain("resetLessonSession(lesson.id)");
  });

  it("does not expose resume messaging on learner entry pages", () => {
    expect(learn).not.toContain("Resume lesson");
    expect(learn).not.toContain("Your lesson is saved");
    expect(learn).not.toContain("Final review");
    expect(learn).toContain("six connected phases");
    expect(home).not.toContain("Resume lesson");
    expect(home).not.toContain("Resume where you stopped");
    expect(home).toContain("6 connected phases");
    expect(backendStore).not.toContain("paused lesson");
  });
});
