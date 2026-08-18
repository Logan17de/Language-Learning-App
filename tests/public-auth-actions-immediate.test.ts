import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicAuthActions = readFileSync(
  "components/auth/public-auth-actions.tsx",
  "utf8",
);
const authService = readFileSync("lib/auth/auth-service.ts", "utf8");

describe("public auth actions", () => {
  it("renders signed-out entry actions without waiting for an identity lookup", () => {
    expect(publicAuthActions).toContain('href="/login"');
    expect(publicAuthActions).toContain('href="/signup"');
    expect(publicAuthActions).not.toContain("Checking account session");
    expect(publicAuthActions).not.toContain("getIdentity()");
  });

  it("uses the lightweight Supabase session check for public UI state", () => {
    expect(publicAuthActions).toContain("authService.hasSession()");
    expect(authService).toContain("client.auth.getSession()");
  });
});
