import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RECOVERY_RESEND_COOLDOWN_MS,
  PASSWORD_RECOVERY_TTL_MS,
} from "@/lib/auth/password-recovery";

const loginPage = readFileSync("app/login/page.tsx", "utf8");
const authForm = readFileSync("components/auth/auth-form.tsx", "utf8");
const recoveryFlow = readFileSync(
  "components/auth/login-recovery-flow.tsx",
  "utf8",
);

describe("inline password recovery", () => {
  it("keeps recovery inside the login shell instead of navigating between pages", () => {
    expect(loginPage).toContain("LoginRecoveryFlow");
    expect(authForm).toContain("onForgotPassword");
    expect(recoveryFlow).toContain('switchStage("email")');
    expect(recoveryFlow).toContain('setStage("code")');
    expect(recoveryFlow).toContain('setStage("password")');
    expect(recoveryFlow).not.toContain("useRouter");
    expect(recoveryFlow).not.toContain('router.push("/reset-password")');
  });

  it("keeps the recovery OTP at five minutes and rate-limits resend UI to one minute", () => {
    expect(PASSWORD_RECOVERY_TTL_MS).toBe(300_000);
    expect(PASSWORD_RECOVERY_RESEND_COOLDOWN_MS).toBe(60_000);
    expect(recoveryFlow).toContain("Didn’t receive the code?");
    expect(recoveryFlow).toContain("Resend code in");
    expect(recoveryFlow).toContain("Resend code");
  });

  it("does not expose whether a submitted email belongs to an account", () => {
    expect(recoveryFlow).toContain(
      "AIko won’t reveal whether an email address is registered",
    );
    expect(recoveryFlow).toContain(
      "A reset code is only delivered when a matching account exists",
    );
    expect(recoveryFlow).toContain(
      "If this email belongs to an AIko account",
    );
    expect(recoveryFlow).not.toContain("email does not exist");
    expect(recoveryFlow).not.toContain("account does not exist");
  });

  it("resends recovery mail using the same Supabase recovery request", () => {
    expect(recoveryFlow).toContain(
      "authService.requestPasswordReset(attempt.email)",
    );
    expect(recoveryFlow).toContain("savePasswordRecoveryAttempt(attempt.email, sentAt)");
    expect(recoveryFlow).toContain("setCode(\"\")");
  });
});
