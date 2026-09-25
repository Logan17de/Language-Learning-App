import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";

const source = (path: string) => readFileSync(path, "utf8");

const authService = source("lib/auth/auth-service.ts");
const authForm = source("components/auth/auth-form.tsx");
const googleIdentityButton = source(
  "components/auth/google-identity-button.tsx",
);
const loginFlow = source("components/auth/login-recovery-flow.tsx");
const oauthCallback = source("components/auth/oauth-callback.tsx");
const middleware = source("lib/supabase/middleware.ts");
const hydrator = source("components/backend/backend-session-hydrator.tsx");
const clientSession = source("lib/auth/client-session.ts");
const accountScope = source("lib/auth/account-scope.ts");
const supabaseClient = source("lib/supabase/client.ts");
const onboarding = source("components/onboarding/onboarding-flow.tsx");
const profileRepository = source("lib/repositories/profile-repository.ts");
const postOnboardingDestination = source(
  "lib/auth/post-onboarding-destination.ts",
);
const vercelConfig = JSON.parse(source("vercel.json")) as {
  git?: { deploymentEnabled?: boolean };
};

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

  it("uses the shared redirect validator throughout auth and onboarding handoff", () => {
    expect(authService).toContain("safeInternalRedirect(next)");
    expect(authForm).toContain("safeInternalRedirect(");
    expect(loginFlow).toContain("withSafeNext(\"/signup\", requestedNext)");
    expect(oauthCallback).toContain(
      "safeInternalRedirect(url.searchParams.get(\"next\"))",
    );
    expect(postOnboardingDestination).toContain("safeInternalRedirect(value)");
    expect(onboarding).toContain("safePostOnboardingDestination(");
  });

  it("cleans up invalid sessions and rejects inactive identities", () => {
    expect(authService).toContain('client.auth.signOut({ scope: "local" })');
    expect(authService).toContain('profile.data.status !== "active"');
    expect(authService).toContain("Your onboarding status could not be loaded.");
  });

  it("requires an active learner profile in middleware and confirmation callbacks", () => {
    expect(middleware).toContain("if (userId && protectedLearner)");
    expect(middleware).toContain('.select("status")');
    expect(middleware).toContain('profile.data.status !== "active"');
    expect(oauthCallback).toContain(
      'returnToAuth(callbackFlow, "account-inactive", explicitNext)',
    );
    expect(oauthCallback).toContain(
      'returnToAuth(callbackFlow, "preferences-load", explicitNext)',
    );
  });

  it("preserves next through login, signup, callback errors, and onboarding", () => {
    expect(loginFlow).toContain("withSafeNext");
    expect(authService).toContain(
      'callbackUrl.searchParams.set("next", safeNext)',
    );
    expect(oauthCallback).toContain('target.searchParams.set("next", safeNext)');
    expect(oauthCallback).toContain(
      "`/onboarding?next=${encodeURIComponent(explicitNext)}`",
    );
    expect(authForm).toContain(
      "`/onboarding?next=${encodeURIComponent(requestedNext)}`",
    );
  });

  it("prevents cross-account local and backend-state reuse", () => {
    expect(accountScope).toContain("previousOwner !== userId");
    expect(accountScope).toContain("resetAccountState()");
    expect(clientSession).toContain(
      "prepareAccountScope(userId, clearClientAccountState)",
    );
    expect(clientSession).toContain("useBackendLessonStore.getState().reset()");
    expect(clientSession).toContain("useBackendProgressStore.getState().reset()");
    expect(clientSession).toContain(
      "useBackendLessonStore.getState().scopeTo(userId)",
    );
    expect(authForm).toContain("applyClientIdentity(result.data)");
  });

  it("uses direct Google ID-token auth without a second PKCE client", () => {
    expect(googleIdentityButton).toContain(
      'src="https://accounts.google.com/gsi/client"',
    );
    expect(googleIdentityButton).toContain("nonce: nonce.hashed");
    expect(authService).toContain("signInWithIdToken");
    expect(authService).toContain('provider: "google"');
    expect(authService).toContain("nonce,");
    expect(authForm).toContain("GoogleIdentityButton");
    expect(supabaseClient).not.toContain("createGoogleOAuthClient");
    expect(supabaseClient).not.toContain("GOOGLE_OAUTH_STORAGE_KEY");
  });

  it("hydrates the client session once instead of reloading on every auth event", () => {
    expect(hydrator).toContain("hydrateClientSession(true)");
    expect(hydrator).not.toContain("hydrate(false)");
    expect(authService).toContain('event === "SIGNED_OUT"');
    expect(clientSession).toContain("hydrationInFlight");
  });

  it("keeps onboarding completion atomic and avoids the removed interests column", () => {
    expect(profileRepository).toContain('rpc("complete_onboarding"');
    expect(profileRepository).toContain("p_daily_study_minutes");
    expect(profileRepository).not.toContain("interests:");
  });

  it("redirects authenticated visitors away from login and shows config errors visibly", () => {
    expect(loginFlow).toContain("isAuthenticated");
    expect(loginFlow).toContain("router.replace(destination)");
    expect(authForm).toContain(
      "Authentication is unavailable because this deployment is missing its backend configuration.",
    );
    expect(authForm).not.toContain("text-stone-300");
    expect(authForm).not.toContain("text-stone-400");
    expect(authForm).not.toContain("😗");
  });

  it("disables automatic Vercel Git deployments", () => {
    expect(vercelConfig.git?.deploymentEnabled).toBe(false);
  });
});
