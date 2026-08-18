import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";

const source = (path: string) => readFileSync(path, "utf8");

const authService = source("lib/auth/auth-service.ts");
const authForm = source("components/auth/auth-form.tsx");
const loginFlow = source("components/auth/login-recovery-flow.tsx");
const oauthCallback = source("components/auth/oauth-callback.tsx");
const middleware = source("lib/supabase/middleware.ts");
const hydrator = source("components/backend/backend-session-hydrator.tsx");
const accountScope = source("lib/auth/account-scope.ts");
const onboarding = source("components/onboarding/onboarding-flow.tsx");

describe("login security regressions", () => {
  it("accepts only normalized AIko-internal redirect targets", () => {
    expect(safeInternalRedirect("/home")).toBe("/home");
    expect(safeInternalRedirect("/subscription?from=login#plan")).toBe(
      "/subscription?from=login#plan",
    );
    expect(safeInternalRedirect("//evil.example/path")).toBeNull();
    expect(safeInternalRedirect("/\\evil.example")).toBeNull();
    expect(safeInternalRedirect("https://evil.example/path")).toBeNull();
    expect(safeInternalRedirect("/home\u0000evil")).toBeNull();
    expect(withSafeNext("/signup", "/subscription")).toBe(
      "/signup?next=%2Fsubscription",
    );
  });

  it("uses the shared redirect validator throughout auth and onboarding", () => {
    expect(authService).toContain("safeInternalRedirect(next)");
    expect(authForm).toContain("safeInternalRedirect(");
    expect(loginFlow).toContain("withSafeNext(\"/signup\", requestedNext)");
    expect(oauthCallback).toContain("safeInternalRedirect(url.searchParams.get(\"next\"))");
    expect(onboarding).toContain("safeInternalRedirect(");
  });

  it("cleans up invalid password sessions and rejects inactive identities", () => {
    expect(authService).toContain('client.auth.signOut({ scope: "local" })');
    expect(authService).toContain('profile.data.status !== "active"');
    expect(authService).toContain("Your onboarding status could not be loaded.");
  });

  it("requires an active learner profile in middleware and Google OAuth", () => {
    expect(middleware).toContain("if (userId && protectedLearner)");
    expect(middleware).toContain('.select("status")');
    expect(middleware).toContain('profile.data.status !== "active"');
    expect(oauthCallback).toContain('returnToAuth(googleFlow, "account-inactive", explicitNext)');
    expect(oauthCallback).toContain('returnToAuth(googleFlow, "preferences-load", explicitNext)');
  });

  it("preserves next through login, signup, OAuth errors, and onboarding", () => {
    expect(loginFlow).toContain("withSafeNext");
    expect(authService).toContain("callbackUrl.searchParams.set(\"next\", safeNext)");
    expect(oauthCallback).toContain('target.searchParams.set("next", safeNext)');
    expect(oauthCallback).toContain("`/onboarding?next=${encodeURIComponent(explicitNext)}`");
  });

  it("prevents cross-account local-state reuse", () => {
    expect(accountScope).toContain("previousOwner !== userId");
    expect(accountScope).toContain("resetAccountState()");
    expect(hydrator).toContain("prepareAccountScope(result.data.id, signOut)");
    expect(authForm).toContain(
      "prepareAccountScope(result.data.id, useAppStore.getState().signOut)",
    );
  });

  it("redirects authenticated visitors away from login and shows config errors visibly", () => {
    expect(loginFlow).toContain("isAuthenticated");
    expect(loginFlow).toContain("router.replace(destination)");
    expect(authForm).toContain("Authentication is unavailable because this deployment is missing its backend configuration.");
    expect(authForm).not.toContain("text-stone-300");
    expect(authForm).not.toContain("text-stone-400");
    expect(authForm).not.toContain("😗");
  });
});
