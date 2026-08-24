import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");

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

describe("a section waiting on a closed lesson says so", () => {
  it("tells the learner to reopen rather than to retry", () => {
    // Reopening runs start_or_resume_lesson_session, which makes the lesson
    // current again, and the queued section then goes through on its own.
    expect(repo).toContain("Active lesson session unavailable");
    expect(repo).toContain("Only the current lesson section can be committed");
    expect(repo).toContain("Reopen this lesson and it will save itself.");
  });
});
