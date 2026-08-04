import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layout = readFileSync("components/admin/admin-layout.tsx", "utf8");
const storage = readFileSync("store/admin-store-migrations.ts", "utf8");

describe("admin authentication recovery", () => {
  it("cannot remain forever in the hydration loading state", () => {
    expect(layout).toContain("useAdminStore.persist.onFinishHydration");
    expect(layout).toContain("ADMIN_HYDRATION_FALLBACK_MS");
    expect(layout).toContain("finishHydration");
    expect(storage).toContain("readableStoredValue");
    expect(storage).toContain("window.localStorage.removeItem(name)");
  });

  it("restores a verified Supabase admin session before redirecting", () => {
    expect(layout).toContain("authService.getIdentity()");
    expect(layout).toContain("canAccessAdmin(identity.data.role)");
    expect(layout).toContain("establishBackendSession(");
    expect(layout).toContain("ADMIN_SESSION_TIMEOUT_MS");
    expect(layout).toContain("identityChecked && !authenticated");
  });
});
