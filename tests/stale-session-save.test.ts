import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");

describe("a lesson left open elsewhere can still keep its place", () => {
  it("writes the checkpoint even after the session was closed", () => {
    // Opening another lesson closes this one. Requiring an open session here
    // meant a browser still sitting on it saved nothing at all: every attempt
    // matched zero rows, and the learner was told to retry something that could
    // never succeed.
    const save = repo.slice(
      repo.indexOf("async saveCheckpoint"),
      repo.indexOf("async abandonActive"),
    );
    expect(save).toContain('.neq("status", "completed")');
    expect(save).not.toContain('.eq("status", "active")');
  });

  it("still refuses to write over a finished lesson", () => {
    const save = repo.slice(
      repo.indexOf("async saveCheckpoint"),
      repo.indexOf("async abandonActive"),
    );
    expect(save).toContain('"completed"');
  });
});

describe("a section waiting on a closed lesson says so", () => {
  it("tells the learner to reopen rather than to retry", () => {
    // Reopening reactivates the session, so the queued section then goes
    // through on its own.
    expect(repo).toContain("Active lesson session unavailable");
    expect(repo).toContain("Only the current lesson section can be committed");
    expect(repo).toContain("Reopen this lesson and it will save itself.");
  });
});
