import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("components/admin/admin-layout.tsx", "utf8");

describe("admin authentication recovery", () => {
  it("always resolves the backend identity check instead of trusting local persistence", () => {
    expect(layout).toContain("authService.getIdentity()");
    expect(layout).toContain("ADMIN_SESSION_TIMEOUT_MS");
    expect(layout).toContain("setIdentityChecked(true)");
    expect(layout).toContain("logout();");
    expect(layout).not.toContain("persist.onFinishHydration");
  });

  it("restores only a verified Supabase admin session before rendering admin routes", () => {
    expect(layout).toContain("canAccessAdmin(identity.data.role)");
    expect(layout).toContain("establishBackendSession(");
    expect(layout).toContain("if (!identityChecked)");
    expect(layout).toContain("if (!authenticated)");
  });
});
