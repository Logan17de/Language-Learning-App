import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const storyPage = readFileSync(
  "components/lesson/progressive-story-page.tsx",
  "utf8",
);

describe("Story survives the handoff from its own page to the player", () => {
  it("commits Story to the database instead of trusting the browser's claim", () => {
    // The Story page hands over a session that already lists Story complete,
    // but that claim only existed locally. The player trusted it, never
    // committed Story, and every later section then failed the ordering gate
    // with "Previous lesson phase is not committed" -- forever, because
    // retrying cannot satisfy a rule about a section that was never committed.
    expect(storyPage).toContain("session.storyComplete = true");
    expect(storyPage).toContain('session.completedPhaseIds = ["story"]');

    const restore = player.slice(player.indexOf("restoreLessonProgress(lesson"));
    expect(restore).toContain("durable.storyComplete");
    expect(restore).toContain('queueLessonPhaseCompletion(lesson, durable, "story")');
  });

  it("does not re-commit Story on every mount", () => {
    expect(player).toContain("storyCommitRef");
    const restore = player.slice(player.indexOf("restoreLessonProgress(lesson"));
    expect(restore).toContain("!storyCommitRef.current");
    expect(restore).toContain("storyCommitRef.current = true");
    // A failed attempt must be retryable rather than latched off.
    expect(restore).toContain("storyCommitRef.current = false");
  });

  it("names the real reason a background save failed", () => {
    // The queue records why each attempt failed; the banner used to blame the
    // connection regardless, sending the learner round a retry that could not
    // succeed with nothing on screen naming the problem.
    const retry = player.slice(player.indexOf("async function retryBackgroundSaves"));
    expect(retry).toContain("pendingLessonPhaseError(lesson.id)");
  });
});
