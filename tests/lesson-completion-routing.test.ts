import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("lesson completion routing", () => {
  it("loads the requested backend lesson directly for completion routes", () => {
    const backendStore = source("store/backend-lesson-store.ts");
    const completionPage = source("app/lesson/[lessonId]/complete/page.tsx");

    expect(backendStore).toContain("lessonRepository.getPlayable(id)");
    expect(completionPage).toContain("useBackendLessonStore");
    expect(completionPage).toContain("loadBackendLesson(lessonId)");
    expect(completionPage).toContain("cachedBackendLesson ?? requestedBackendLesson");
  });

  it("finishes whichever phase is actually last", () => {
    const player = source("components/lesson/lesson-player.tsx");

    expect(player).toContain(
      "session.currentPhaseIndex === lesson.phases.length - 1",
    );
    expect(player).toContain('continueLabel={isLastPhase ? "See results"');
    expect(player).not.toContain('if (currentPhase.id === "review")');
  });
});
