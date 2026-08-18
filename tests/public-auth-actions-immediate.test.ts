import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicAuthActions = readFileSync(
  "components/auth/public-auth-actions.tsx",
  "utf8",
);
const publicAuthProvider = readFileSync(
  "components/auth/public-auth-provider.tsx",
  "utf8",
);
const homepage = readFileSync("app/page.tsx", "utf8");
const authService = readFileSync("lib/auth/auth-service.ts", "utf8");

describe("public auth actions", () => {
  it("renders signed-out entry actions without waiting for an identity lookup", () => {
    expect(publicAuthActions).toContain('href="/login"');
    expect(publicAuthActions).toContain('href="/signup"');
    expect(publicAuthActions).not.toContain("Checking account session");
    expect(publicAuthActions).not.toContain("getIdentity()");
  });

  it("resolves public auth once and shares it across landing CTAs", () => {
    expect(homepage).toContain("<PublicAuthProvider>");
    expect(publicAuthActions).toContain("usePublicAuthState");
    expect(publicAuthActions).not.toContain("authService.hasSession()");
    expect(publicAuthProvider).toContain("authService.hasSession()");
    expect(publicAuthProvider.match(/authService\.hasSession\(\)/g) ?? []).toHaveLength(1);
    expect(publicAuthProvider.match(/authService\.subscribe\(/g) ?? []).toHaveLength(1);
    expect(authService).toContain("client.auth.getSession()");
  });
});
