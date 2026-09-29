import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("progressive custom lesson story", () => {
  const progressiveStory = source(
    "components/lesson/progressive-story-page.tsx",
  );

  it("finishes Story with one learner action and auto-opens Vocabulary", () => {
    expect(progressiveStory).toContain("function finishStory()");
    expect(progressiveStory).toContain("setStoryComplete(true)");
    expect(progressiveStory).toContain(
      "if (!storyComplete || !lessonReady || !lessonId) return;",
    );
    expect(progressiveStory).toContain("continueToLesson();");
    expect(progressiveStory).toContain("router.replace(`/lesson/${lessonId}/play`)");
    expect(progressiveStory).toContain("session.currentPhaseIndex = 1");
  });

  it("keeps build state warm when the browser tab is backgrounded or restored", () => {
    expect(progressiveStory).toContain("window.sessionStorage");
    expect(progressiveStory).toContain("router.prefetch(`/lesson/${lessonId}/play`)");
    expect(progressiveStory).not.toContain("document.hidden ? 10_000");
    expect(progressiveStory).toContain("result.lessonReady ? 5_000 : 2_500");
  });

  it("uses the current six-phase and three-group lesson contract", () => {
    expect(progressiveStory).toContain("const TOTAL_PHASES = 6");
    expect(progressiveStory).toContain("const ACTIVITY_GROUP_COUNT = 3");
    expect(progressiveStory).not.toContain('final_review: "Final review ready"');
    expect(progressiveStory).not.toContain("of 4 activity groups ready");
  });
});
