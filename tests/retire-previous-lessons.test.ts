import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  discardSyncOperationsForOtherLessons,
  enqueueSync,
  readSyncQueue,
} from "@/lib/sync/offline-queue";

const CURRENT = "11111111-1111-1111-1111-111111111111";
const OLD = "22222222-2222-2222-2222-222222222222";

/** The queue is browser storage; these tests run in node, so stand one up. */
function installBrowserStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
  (globalThis as { window?: unknown }).window = {
    localStorage,
    dispatchEvent: () => true,
  };
}

describe("a new lesson retires the one before it", () => {
  beforeEach(() => {
    installBrowserStorage();
  });

  it("drops queued work belonging to abandoned lessons", () => {
    // These can never be accepted: commit_lesson_phase validates against the
    // server checkpoint, and an abandoned session has had its incomplete phase
    // reset, so the commit is refused as "Story phase is incomplete" forever.
    enqueueSync("lesson_phase_commit", `lesson_phase_commit:${OLD}:story`, {});
    enqueueSync("lesson_checkpoint", `lesson_checkpoint:${OLD}`, {});
    enqueueSync("lesson_completion", `lesson_completion:${OLD}`, {});

    discardSyncOperationsForOtherLessons(CURRENT);

    expect(readSyncQueue()).toEqual([]);
  });

  it("keeps every kind of queued work for the lesson being learned", () => {
    enqueueSync("lesson_phase_commit", `lesson_phase_commit:${CURRENT}:story`, {});
    enqueueSync("lesson_checkpoint", `lesson_checkpoint:${CURRENT}`, {});
    enqueueSync("lesson_completion", `lesson_completion:${CURRENT}`, {});
    enqueueSync("lesson_phase_commit", `lesson_phase_commit:${OLD}:grammar`, {});

    discardSyncOperationsForOtherLessons(CURRENT);

    const kept = readSyncQueue().map((item) => item.dedupeKey);
    expect(kept).toHaveLength(3);
    expect(kept.every((key) => key.includes(CURRENT))).toBe(true);
  });

  it("does not treat a lesson id as a prefix of a longer one", () => {
    enqueueSync("lesson_checkpoint", `lesson_checkpoint:${CURRENT}extra`, {});
    discardSyncOperationsForOtherLessons(CURRENT);
    expect(readSyncQueue()).toEqual([]);
  });
});

describe("retirement runs when the new lesson exists", () => {
  it("fires as soon as the story resolves a lesson id", () => {
    const story = readFileSync(
      "components/lesson/progressive-story-page.tsx",
      "utf8",
    );
    const atResolve = story.slice(story.indexOf("const nextLessonId ="));
    expect(atResolve.slice(0, 600)).toContain("retirePreviousLessons(nextLessonId)");
  });

  it("fires on the path where the lesson already existed", () => {
    const library = readFileSync("components/learn/lesson-library.tsx", "utf8");
    expect(library).toContain("retirePreviousLessons(result.lesson_id)");
  });

  it("clears the local session for retired lessons too", () => {
    const helper = readFileSync("lib/sync/retire-previous-lessons.ts", "utf8");
    expect(helper).toContain("discardSyncOperationsForOtherLessons(lessonId)");
    expect(helper).toContain("keepOnlyLessonSession(lessonId)");
  });
});
