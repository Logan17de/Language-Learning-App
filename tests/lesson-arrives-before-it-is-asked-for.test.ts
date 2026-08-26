import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storyPage = readFileSync("components/lesson/progressive-story-page.tsx", "utf8");
const resolver = readFileSync("components/lesson/lesson-route-resolver.tsx", "utf8");
const lessonRepo = readFileSync("lib/repositories/lesson-repository.ts", "utf8");
const sessionRepo = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");
const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const lessonStore = readFileSync("store/backend-lesson-store.ts", "utf8");

/**
 * The pause between finishing the story and seeing the first vocabulary
 * question was all fetching, and all of it started only once the learner asked.
 */
describe("the lesson is fetched while the learner is still reading", () => {
  it("warms the playable lesson from the story page", () => {
    expect(storyPage).toContain("useBackendLessonStore");
    expect(storyPage).toContain(".loadOne(lessonId)");
  });

  it("does not make vocabulary wait for non-blocking listening audio", () => {
    const warmingEffect = storyPage.slice(
      storyPage.indexOf("Fetch the lesson while the learner is still reading"),
      storyPage.indexOf("const supportedWordCount"),
    );
    expect(warmingEffect).toContain("if (!lessonId || !lessonReady) return");
    expect(warmingEffect).not.toContain(
      'lessonReady && (audioStatus === "ready" || audioStatus === "failed")',
    );
  });
});

describe("opening a lesson stops waiting on things it does not use", () => {
  it("no longer gates the player on the product contract RPC", () => {
    // The flag it resolved was set and never read: protected practice comes
    // from lesson.premiumPhaseAccess, which the server decides while loading.
    expect(resolver).not.toContain("learnProductContractIsActive");
    expect(resolver).not.toContain("contractResolved");
  });

  it("fetches one playable payload for the burst that opens a lesson", () => {
    expect(lessonRepo).toContain("function readPlayableCache");
    expect(lessonRepo).toContain("playableCache.delete(idOrLegacyId)");
    expect(lessonRepo).toContain('rpc("get_playable_lesson_payload"');
  });

  it("never lets one account read the payload loaded for another", () => {
    // The payload carries the learner's plan and their kanji history, so a
    // cache that outlived a sign-out would hand the next person both.
    expect(lessonStore).toContain("forgetCachedLessons");
    const scoping = lessonStore.slice(
      lessonStore.indexOf("scopeTo: (userId)"),
      lessonStore.indexOf("load: async"),
    );
    expect(scoping).toContain("forgetCachedLessons()");
  });

  it("identifies a lesson without loading all of it", () => {
    expect(lessonRepo).toContain("export async function canonicalLessonId");
    // The commit path asks which lesson row this is, not for its contents.
    const lookup = sync.slice(
      sync.indexOf("async function lessonSessionId"),
      sync.indexOf("function phaseAnswers"),
    );
    expect(lookup.indexOf("canonicalLessonId")).toBeLessThan(
      lookup.indexOf("getPlayable"),
    );
  });

  it("reads the signed-in learner from the session it already holds", () => {
    // getUser() is a round trip to the auth server, and finishing one section
    // made three of them before any of the work started.
    expect(sessionRepo).toContain("currentUserId(client)");
    const saves = sessionRepo.slice(
      sessionRepo.indexOf("async saveAnswers"),
      sessionRepo.indexOf("async commitPhase"),
    );
    expect(saves).not.toContain("auth.getUser()");
  });
});
