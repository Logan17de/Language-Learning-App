import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");
const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");

describe("a lesson the learner moved off cannot be written to", () => {
  it("keeps the active filter, because the database enforces it anyway", () => {
    // active_session_update_only is a RESTRICTIVE policy, so it ANDs with the
    // permissive ones: the database refuses any write to a session that is not
    // open, whatever the query asks for. Widening the filter only hides that.
    const save = repo.slice(
      repo.indexOf("async saveCheckpoint"),
      repo.indexOf("async abandonActive"),
    );
    expect(save).toContain('.eq("status", "active")');
    expect(save).toContain("RESTRICTIVE");
  });
});

describe("a lesson taken over by a newer one is over here", () => {
  it("says the lesson was set aside rather than asking for a retry", () => {
    expect(repo).toContain("This lesson was set aside when another lesson was opened");
    expect(repo).toContain("You have a newer lesson open, so this one was set aside.");
    // The old advice. Reopening is exactly what let two browsers take the open
    // slot from each other, so it must not come back.
    expect(repo).not.toContain("Reopen this lesson and it will save itself.");
  });

  it("resolves the session for a retry instead of reopening it", () => {
    const lookup = sync.slice(
      sync.indexOf("async function lessonSessionId"),
      sync.indexOf("function phaseAnswers"),
    );
    expect(lookup).toContain("lessonSessionRepository.resolveSession");
    expect(lookup).toContain("LessonSupersededError");
    // startOrResume survives in this helper for one case only: a lesson that
    // has never been opened anywhere, which has no other lesson's slot to take.
    expect(lookup.indexOf("resolveSession")).toBeLessThan(
      lookup.indexOf("startOrResume"),
    );
  });

  it("drops the queued work rather than retrying what cannot be accepted", () => {
    expect(sync).toContain("function retireSupersededLesson");
    expect(sync).toContain("discardLessonSyncOperations(lessonId)");
    expect(sync).toContain("markLessonSuperseded(lessonId)");
  });

  it("stops the lesson in the browser that was left behind", () => {
    expect(player).toContain("lessonSupersededEvent");
    expect(player).toContain("You have a newer lesson open");
    expect(player).toContain("still counts");
    // No Retry: there is nothing to retry against, and the button used to
    // reopen this lesson and close the one the learner had moved to.
    const screen = player.slice(player.indexOf("function LessonTakenOver"));
    expect(screen).not.toContain("Retry");
  });
});
