import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");
const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const standing = readFileSync("lib/sync/lesson-standing.ts", "utf8");

describe("a lesson the learner moved off cannot be written to", () => {
  it("lets the atomic server RPC decide which session owns the save", () => {
    const save = repo.slice(
      repo.indexOf("async saveCheckpoint"),
      repo.indexOf("async abandonActive"),
    );
    expect(save).toContain('"save_authoritative_lesson_checkpoint"');
    expect(save).not.toContain('.from("lesson_sessions").update');
  });
});

describe("a lesson taken over by a newer one is over here", () => {
  it("says the lesson was set aside rather than asking for a retry", () => {
    expect(standing).toContain("This lesson was set aside when another lesson was opened");
    expect(standing).toContain("A newer lesson owns this checkpoint");
    expect(standing).toContain("You have a newer lesson open, so this one was set aside.");
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
    expect(player).toContain("activeLessonChangedEvent");
    expect(player).toContain('window.addEventListener("storage", handleStorage)');
    expect(player).toContain("isLessonSupersededError(error)");
    expect(player).toContain("You have a newer lesson open");
    expect(player).toContain("still counts");
    // No Retry: there is nothing to retry against, and the button used to
    // reopen this lesson and close the one the learner had moved to.
    const screen = player.slice(player.indexOf("function LessonTakenOver"));
    expect(screen).not.toContain("Retry");
  });

  it("does not report a retired queued operation as a successful save", () => {
    expect(sync).toContain(
      "!stillQueued() && !lessonWasSuperseded(lesson.id)",
    );
    expect(sync).toContain("!lessonWasSuperseded(lessonId)");
  });

  it("never turns a definitive takeover back into a retryable checkpoint", () => {
    const checkpointOnly = sync.slice(
      sync.indexOf("async function persistCheckpointOnly"),
      sync.indexOf("function legacyPhaseBoundary"),
    );
    expect(checkpointOnly).toContain(
      "if (isLessonSupersededError(error)) throw error",
    );

    const progress = sync.slice(
      sync.indexOf("export async function syncLessonProgress"),
      sync.indexOf("export async function confirmLessonStanding"),
    );
    const afterPersist = progress.slice(
      progress.indexOf("const synced = await persistCheckpointOnly"),
    );
    expect(afterPersist.indexOf("lessonWasSuperseded(lesson.id)")).toBeLessThan(
      afterPersist.indexOf("enqueueSync("),
    );
  });

  it("rechecks ownership when a takeover races any phase write", () => {
    expect(sync).toContain("async function throwLessonPersistenceError");
    expect(sync).toContain("await lessonSessionId(lesson)");
    expect(sync).toContain(
      "throwLessonPersistenceError(lesson, answers.error.message)",
    );
    expect(sync).toContain(
      "throwLessonPersistenceError(lesson, events.error.message)",
    );
    expect(sync).toContain(
      "throwLessonPersistenceError(lesson, committed.error.message)",
    );
    expect(sync).toContain(
      "throwLessonPersistenceError(lesson, skipped.error.message)",
    );
    expect(sync).toContain(
      "throwLessonPersistenceError(lesson, result.error.message)",
    );
  });
});
