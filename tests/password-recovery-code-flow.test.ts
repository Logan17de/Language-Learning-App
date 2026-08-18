import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PASSWORD_RECOVERY_TTL_MS } from "@/lib/auth/password-recovery";

const authService = readFileSync("lib/auth/auth-service.ts", "utf8");
const authForm = readFileSync("components/auth/auth-form.tsx", "utf8");
const forgotPasswordPage = readFileSync("app/forgot-password/page.tsx", "utf8");
const resetPasswordPage = readFileSync("app/reset-password/page.tsx", "utf8");
const forgotPasswordLayout = readFileSync("app/forgot-password/layout.tsx", "utf8");
const resetPasswordLayout = readFileSync("app/reset-password/layout.tsx", "utf8");
const loginPage = readFileSync("app/login/page.tsx", "utf8");
const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
const recoveryTemplate = readFileSync("supabase/templates/recovery.html", "utf8");

describe("password recovery code flow", () => {
  it("uses a five-minute six-digit Supabase recovery OTP", () => {
    expect(PASSWORD_RECOVERY_TTL_MS).toBe(300_000);
    expect(supabaseConfig).toContain("otp_length = 6");
    expect(supabaseConfig).toContain("otp_expiry = 300");
    expect(authService).toContain("client.auth.resetPasswordForEmail(email)");
    expect(authService).toContain('type: "recovery"');
  });

  it("moves the learner from email entry to code verification while preserving next", () => {
    expect(authForm).toContain('withSafeNext("/forgot-password", requestedNext)');
    expect(forgotPasswordPage).toContain("savePasswordRecoveryAttempt(normalizedEmail)");
    expect(forgotPasswordPage).toContain('router.push(withSafeNext("/reset-password", requestedNext))');
    expect(resetPasswordPage).toContain('autoComplete="one-time-code"');
    expect(resetPasswordPage).toContain("verifyPasswordResetCode(attempt.email, code)");
    expect(resetPasswordPage).toContain("if (!verified)");
    expect(resetPasswordPage).toContain('withSafeNext("/login", requestedNext)');
  });

  it("gives clear incorrect and expired code feedback", () => {
    expect(authService).toContain("That code is incorrect. Check the 6 digits and try again.");
    expect(resetPasswordPage).toContain(
      "That code has expired. Request a new password-reset code.",
    );
    expect(resetPasswordPage).toContain("Code expires in");
  });

  it("keeps recovery navigation explicit and readable", () => {
    expect(forgotPasswordPage).toContain("Back to login");
    expect(resetPasswordPage).toContain("Back to login");
    expect(resetPasswordPage).not.toContain("text-stone-400");
  });

  it("noindexes auth recovery routes with route-specific metadata", () => {
    for (const metadataSource of [loginPage, forgotPasswordLayout, resetPasswordLayout]) {
      expect(metadataSource).toContain("index: false");
      expect(metadataSource).toContain("follow: false");
    }
    expect(loginPage).toContain('canonical: "/login"');
    expect(forgotPasswordLayout).toContain('title: "Reset password"');
    expect(forgotPasswordLayout).toContain('canonical: "/forgot-password"');
    expect(resetPasswordLayout).toContain('canonical: "/reset-password"');
  });

  it("sends a code-only automated recovery email with the support address", () => {
    expect(recoveryTemplate).toContain("{{ .Token }}");
    expect(recoveryTemplate).not.toContain("{{ .ConfirmationURL }}");
    expect(recoveryTemplate).toContain("5 minutes");
    expect(recoveryTemplate).toContain("This is an automated account email. Please do not reply.");
    expect(recoveryTemplate).toContain("support.aiko@zetbros.com");
    expect(supabaseConfig).toContain('subject = "Your AIko password reset code"');
  });

  it("closes the recovery session after changing the password", () => {
    expect(resetPasswordPage).toContain("await authService.signOut()");
    expect(resetPasswordPage).toContain("Sign in again with your updated password.");
  });
});
