import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const hydrator = source("components/backend/backend-session-hydrator.tsx");
// Session restoration itself was extracted out of the component.
const clientSession = source("lib/auth/client-session.ts");
const guard = source("components/auth/learner-route-guard.tsx");
const backendStore = source("store/backend-lesson-store.ts");
const progressStore = source("store/backend-progress-store.ts");

describe("returning to the browser tab keeps learner pages static", () => {
  it("blocks the route only for the initial backend session restoration", () => {
    // Only a blocking hydration clears backendSessionChecked, so only the
    // first restoration can gate a protected route.
    expect(clientSession).toContain("export async function hydrateClientSession(");
    expect(clientSession).toContain("blocking = true,");
    expect(clientSession).toContain("if (blocking) {");
    expect(clientSession).toContain("setBackendSessionChecked(false)");
    expect(hydrator).toContain("await hydrateClientSession(true)");
    expect(hydrator).toContain("void restoreSession()");
  });

  it("does not tear down an authenticated learner page during a background auth refresh", () => {
    const subscriptionStart = hydrator.indexOf("authService.subscribe");
    expect(subscriptionStart).toBeGreaterThan(-1);
    // A background refresh that keeps the learner signed in is ignored
    // outright, so an authenticated page is never re-gated or torn down.
    const handler = hydrator.slice(subscriptionStart);
    expect(handler).toContain("if (signedIn) return;");
    expect(handler).not.toContain("hydrateClientSession");
    expect(guard).toContain("!backendSessionChecked");
  });

  it("revalidates a same-account lesson without replacing trusted assignment UI with loading", () => {
    // Re-scoping to the account that already owns the store is a no-op, so a
    // returning tab never pushes trusted lessons back through a loading state.
    expect(backendStore).toContain("if (current.ownerUserId === userId) return");
  });

  it("keeps the last trusted progress snapshot during silent background refresh failures", () => {
    expect(progressStore).toContain("if (!blocking && current.status === \"ready\") return;");
    expect(progressStore).toContain("if (!blocking && get().status === \"ready\") return;");
    expect(clientSession).toContain(".fail(userId, progress.error.message, blocking)");
  });
});
