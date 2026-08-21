import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIGNUP_CONFIRMATION_RESEND_COOLDOWN_MS } from "@/lib/auth/pending-signup-confirmation";

const source = (path: string) => readFileSync(path, "utf8");

const signupPage = source("app/signup/page.tsx");
const signupFlow = source("components/auth/signup-flow.tsx");
const authForm = source("components/auth/auth-form.tsx");
const authService = source("lib/auth/auth-service.ts");
const callback = source("components/auth/oauth-callback.tsx");
const callbackPage = source("app/auth/callback/page.tsx");
// Identity application was extracted into the shared client-session module.
const clientSession = source("lib/auth/client-session.ts");

describe("signup security regressions", () => {
  it("blocks account creation until the signed-in guard resolves", () => {
    expect(signupFlow).toContain("!backendSessionChecked");
    expect(signupFlow).toContain("Checking your account status…");
    expect(signupFlow).toContain("if (isAuthenticated)");
    expect(signupFlow).toContain("router.replace(destination)");
    expect(signupFlow).toContain("requestedNext ?? \"/home\"");
  });

  it("preserves validated next destinations when moving back to login", () => {
    expect(signupFlow).toContain('withSafeNext("/login", requestedNext)');
    expect(authForm).toContain('withSafeNext("/signup?confirmation=required", requestedNext)');
  });

  it("separates email confirmation from Google OAuth callback failures", () => {
    expect(authService).toContain('callbackUrl.searchParams.set("flow", "email-confirmation")');
    // Google now signs in through an ID token rather than an OAuth callback,
    // so the callback handles admin and email-confirmation flows only.
    expect(callback).toContain('type AuthCallbackFlow = "admin" | "email-confirmation"');
    expect(callback).toContain('"confirmation-expired"');
    expect(callback).toContain('"confirmation-failed"');
    expect(callback).toContain("callbackParam(url, \"error_description\")");
    expect(signupFlow).toContain("That confirmation link expired.");
    expect(signupFlow).not.toContain("Google sign-in could not be completed");
  });

  it("supports resending signup confirmation with a cooldown", () => {
    expect(SIGNUP_CONFIRMATION_RESEND_COOLDOWN_MS).toBe(60_000);
    expect(authService).toContain("client.auth.resend({");
    expect(authService).toContain('type: "signup"');
    expect(authService).toContain("emailRedirectTo: emailConfirmationCallback(next)");
    expect(signupFlow).toContain("Resend confirmation email");
    expect(signupFlow).toContain("savePendingSignupConfirmation(");
  });

  it("trims and bounds first names before account creation", () => {
    expect(authForm).toContain("const FIRST_NAME_MAX_LENGTH = 50");
    expect(authForm).toContain("const normalizedName = name.trim()");
    expect(authForm).toContain("if (!normalizedName)");
    expect(authForm).toContain("maxLength={FIRST_NAME_MAX_LENGTH}");
    expect(authService).toContain("const normalizedDisplayName = displayName.trim()");
  });

  it("establishes the real backend identity for immediate-session signup", () => {
    expect(authService).toContain("identity: AuthIdentity | null");
    expect(authService).toContain("loadActiveIdentity(");
    // Signup refuses to continue without a real backend identity, then
    // establishes account scope through applyClientIdentity().
    expect(authForm).toContain("if (!result.data.identity)");
    expect(authForm).toContain("applyClientIdentity(result.data.identity)");
    expect(clientSession).toContain("prepareAccountScope(");
    expect(clientSession).toContain("syncBackendIdentity(");
  });

  it("keeps signup and callback routes private from search indexing", () => {
    expect(signupPage).toContain("robots: { index: false, follow: false }");
    expect(signupPage).toContain('canonical: "/signup"');
    expect(callbackPage).toContain("robots: { index: false, follow: false }");
    expect(callbackPage).toContain('canonical: "/auth/callback"');
    expect(callbackPage).toContain('title: "Completing account setup"');
  });

  it("links account creation to the existing legal policies", () => {
    expect(signupFlow).toContain("By creating an account, you agree to the");
    expect(signupFlow).toContain('href="/terms"');
    expect(signupFlow).toContain('href="/privacy"');
    expect(signupFlow).toContain("Privacy Policy");
  });
});
