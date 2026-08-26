import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const home = source("components/home/home-dashboard.tsx");
const homePage = source("app/home/page.tsx");
// Account scoping and progress hydration were extracted from the hydrator
// component into the shared client-session module.
const hydrator = source("lib/auth/client-session.ts");
const lessonStore = source("store/backend-lesson-store.ts");
const progressStore = source("store/backend-progress-store.ts");
const progressRepository = source("lib/repositories/progress-repository.ts");
const progressBar = source("components/ui/progress-bar.tsx");

describe("home dashboard state integrity", () => {
  it("scopes assigned lessons to the authenticated account and drops stale responses", () => {
    expect(lessonStore).toContain("ownerUserId: string | null");
    expect(lessonStore).toContain("scopeTo: (userId: string) => void");
    expect(lessonStore).toContain("reset: () => void");
    expect(lessonStore).toContain("if (current.ownerUserId === userId) return");
    expect(lessonStore).toContain("get().ownerUserId !== ownerUserId");

    expect(hydrator).toContain("useBackendLessonStore.getState().reset()");
    expect(hydrator).toContain("useBackendLessonStore.getState().scopeTo(userId)");
    expect(hydrator).toContain("prepareAccountScope(userId, clearClientAccountState)");
  });

  it("tracks whether progress is loading, trusted, or failed instead of treating defaults as server truth", () => {
    expect(progressStore).toContain(
      'export type BackendProgressStatus = "idle" | "loading" | "ready" | "error"',
    );
    expect(progressStore).toContain("completedLessonCount: number | null");
    expect(hydrator).toContain("useBackendProgressStore.getState().begin(userId, blocking)");
    expect(hydrator).toContain(".succeed(userId, progress.data.completedLessonCount)");
    expect(hydrator).toContain(".fail(userId, progress.error.message, blocking)");

    expect(home).toContain("const progressReady =");
    expect(home).toContain('backendProgressStatus === "ready"');
    expect(home).toContain('backendProgressStatus === "error"');
    expect(home).toContain("progressOwnerUserId === user.id");
  });

  it("does not perform a second automatic progress load when Home mounts", () => {
    // Progress is hydrated once by the client session. Home only reloads it
    // when the learner explicitly retries.
    const progressLoadOccurrences = home.match(/progressRepository\.loadCurrent\(\)/g) ?? [];
    expect(progressLoadOccurrences).toHaveLength(1);
    expect(home.indexOf("progressRepository.loadCurrent()")).toBeGreaterThan(
      home.indexOf("async function retryProgress()"),
    );
  });

  it("keeps recent completions capped but retrieves an exact all-time lesson count", () => {
    expect(progressRepository).toContain("completedLessonCount: number");
    expect(progressRepository).toContain('.limit(20)');
    expect(progressRepository).toContain('.select("id", { count: "exact", head: true })');
    expect(progressRepository).toContain("completedLessonCount: completionCount.count ?? 0");
    expect(home).toContain("completedLessonCount");
    expect(home).toContain("authoritativeLessonCount");
    expect(home).not.toContain("progress.completedLessonIds.length} label=\"lessons\"");
  });

  it("sends Home to /learn instead of assigning a lesson", () => {
    // The predefined-catalog assignment CTA was retired: /learn is the single
    // learner entry point and owns lesson creation and Resume.
    expect(home).toContain('href="/learn"');
    expect(home).not.toContain("Choosing lesson…");
    expect(home).not.toContain("Retry lesson selection");
    expect(home).not.toContain("See my next lesson");
    expect(home).not.toContain("loadBackendLessons");
  });

  it("marks Home private/canonical and names its mastery progressbar", () => {
    expect(homePage).toContain('alternates: { canonical: "/home" }');
    expect(homePage).toContain("robots: { index: false, follow: false }");
    expect(progressBar).toContain('"aria-label"?: string');
    expect(progressBar).toContain("aria-label={ariaLabel}");
    expect(home).toContain('aria-label="Learning progress"');
  });
});
