import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const hydrator = source("components/backend/backend-session-hydrator.tsx");
const guard = source("components/auth/learner-route-guard.tsx");
const backendStore = source("store/backend-lesson-store.ts");
const progressStore = source("store/backend-progress-store.ts");

describe("returning to the browser tab keeps learner pages static", () => {
  it("blocks the route only for the initial backend session restoration", () => {
    expect(hydrator).toContain("async function hydrate(blocking: boolean)");
    expect(hydrator).toContain("if (blocking) {");
    expect(hydrator).toContain("setBackendSessionChecked(false)");
    expect(hydrator).toContain("void hydrate(true)");
    expect(hydrator).toContain("void hydrate(false)");
  });

  it("does not tear down an authenticated learner page during a background auth refresh", () => {
    const subscriptionStart = hydrator.indexOf("authService.subscribe");
    const backgroundHydrate = hydrator.indexOf("void hydrate(false)", subscriptionStart);
    expect(subscriptionStart).toBeGreaterThan(-1);
    expect(backgroundHydrate).toBeGreaterThan(subscriptionStart);
    expect(guard).toContain("!backendSessionChecked");
  });

  it("revalidates a same-account lesson without replacing trusted assignment UI with loading", () => {
    expect(backendStore).toContain("current.status === \"idle\"");
    expect(backendStore).toContain("if (blocking) {");
    expect(backendStore).toContain("status: \"loading\"");
    expect(backendStore).toContain("const hasTrustedLesson = !blocking && get().lessons.length > 0");
    expect(backendStore).toContain("status: hasTrustedLesson ? \"ready\" : \"error\"");
  });

  it("keeps the last trusted progress snapshot during silent background refresh failures", () => {
    expect(progressStore).toContain("if (!blocking && current.status === \"ready\") return;");
    expect(progressStore).toContain("if (!blocking && get().status === \"ready\") return;");
    expect(hydrator).toContain(".fail(userId, progress.error.message, blocking)");
  });
});
