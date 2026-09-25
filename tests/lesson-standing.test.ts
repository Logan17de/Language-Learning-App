import { beforeEach, describe, expect, it } from "vitest";
import {
  activeLessonFromStorage,
  describesSupersededLesson,
  forgetSupersededLessons,
  isLessonSupersededError,
  LessonSupersededError,
  lessonWasSuperseded,
  markLessonSuperseded,
} from "@/lib/sync/lesson-standing";

beforeEach(() => {
  forgetSupersededLessons();
});

describe("recognising the database's refusal", () => {
  it("reads the server's own sentence", () => {
    expect(
      describesSupersededLesson(
        "This lesson was set aside when another lesson was opened",
      ),
    ).toBe(true);
  });

  it("does not claim every refusal", () => {
    // A locked Premium section and an expired sign-in are refusals too, and
    // treating either as a takeover would end a lesson the learner still has.
    expect(describesSupersededLesson("You do not have permission to do that.")).toBe(
      false,
    );
    expect(describesSupersededLesson("Your session has expired.")).toBe(false);
    expect(describesSupersededLesson("")).toBe(false);
  });
});

describe("remembering which lesson this browser is out of", () => {
  it("holds the answer for a player that mounts afterwards", () => {
    expect(lessonWasSuperseded("lesson-a")).toBe(false);
    markLessonSuperseded("lesson-a");
    expect(lessonWasSuperseded("lesson-a")).toBe(true);
    expect(lessonWasSuperseded("lesson-b")).toBe(false);
  });

  it("ignores an empty id rather than shutting every lesson down", () => {
    markLessonSuperseded("   ");
    expect(lessonWasSuperseded("")).toBe(false);
  });

  it("carries the lesson it was raised for", () => {
    const error = new LessonSupersededError("lesson-a");
    expect(isLessonSupersededError(error)).toBe(true);
    expect(error.lessonId).toBe("lesson-a");
    expect(isLessonSupersededError(new Error(error.message))).toBe(true);
  });

  it("recognises takeover errors after a repository has wrapped them", () => {
    expect(
      isLessonSupersededError(
        new Error(
          "You have a newer lesson open, so this one was set aside. Everything you finished here is already counted.",
        ),
      ),
    ).toBe(true);
    // A phase-order bug can produce this while the lesson is still active. It
    // must remain actionable rather than incorrectly closing the lesson.
    expect(
      isLessonSupersededError(
        new Error("Only the current lesson section can be committed"),
      ),
    ).toBe(false);
    expect(isLessonSupersededError(new Error("Network request failed"))).toBe(
      false,
    );
  });

  it("reads only valid cross-tab active lesson announcements", () => {
    expect(
      activeLessonFromStorage(
        JSON.stringify({ lessonId: "lesson-b", nonce: "one" }),
      ),
    ).toBe("lesson-b");
    expect(activeLessonFromStorage("not-json")).toBeNull();
    expect(activeLessonFromStorage(JSON.stringify({ lessonId: 42 }))).toBeNull();
  });
});
