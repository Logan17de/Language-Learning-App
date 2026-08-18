import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RECOVERY_RESEND_COOLDOWN_MS,
  PASSWORD_RECOVERY_TTL_MS,
} from "@/lib/auth/password-recovery";

const loginFlow = readFileSync(
  "components/auth/login-recovery-flow.tsx",
  "utf8",
);
const authForm = readFileSync("components/auth/auth-form.tsx", "utf8");
const forgotPage = readFileSync("app/forgot-password/page.tsx", "utf8");
const resetPage = readFileSync("app/reset-password/page.tsx", "utf8");

describe("routed password recovery", () => {
  it("uses the dedicated recovery routes instead of duplicating OTP stages in login", () => {
    expect(authForm).toContain('withSafeNext("/forgot-password", requestedNext)');
    expect(loginFlow).not.toContain("RecoveryStage");
    expect(loginFlow).not.toContain("verifyPasswordResetCode");
    expect(loginFlow).not.toContain("requestPasswordReset");
    expect(forgotPage).toContain('router.push(withSafeNext("/reset-password", requestedNext))');
    expect(resetPage).toContain("readPasswordRecoveryAttempt()");
  });

  it("keeps the recovery OTP at five minutes and the resend contract at one minute", () => {
    expect(PASSWORD_RECOVERY_TTL_MS).toBe(300_000);
    expect(PASSWORD_RECOVERY_RESEND_COOLDOWN_MS).toBe(60_000);
  });

  it("keeps recovery state and destination restorable after a refresh", () => {
    expect(forgotPage).toContain("savePasswordRecoveryAttempt(normalizedEmail)");
    expect(forgotPage).toContain('withSafeNext("/reset-password", requestedNext)');
    expect(resetPage).toContain("readPasswordRecoveryAttempt()");
    expect(resetPage).toContain('safeInternalRedirect(');
    expect(resetPage).toContain('withSafeNext("/login", requestedNext)');
    expect(resetPage).toContain('autoComplete="one-time-code"');
  });
});
