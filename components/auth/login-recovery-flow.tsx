"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import {
  clearPasswordRecoveryAttempt,
  PASSWORD_RECOVERY_RESEND_COOLDOWN_MS,
  PASSWORD_RECOVERY_TTL_MS,
  passwordRecoveryRemainingMs,
  passwordRecoveryResendRemainingMs,
  savePasswordRecoveryAttempt,
  type PasswordRecoveryAttempt,
} from "@/lib/auth/password-recovery";
import {
  isStrongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";
import { AIKO_SUPPORT_EMAIL, AIKO_SUPPORT_MAILTO } from "@/lib/contact";

type RecoveryStage = "login" | "email" | "code" | "password" | "done";

export function LoginRecoveryFlow() {
  const [stage, setStage] = useState<RecoveryStage>("login");
  const [email, setEmail] = useState("");
  const [attempt, setAttempt] = useState<PasswordRecoveryAttempt | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (stage !== "code") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const codeRemainingMs = attempt
    ? passwordRecoveryRemainingMs(attempt.sentAt, now)
    : PASSWORD_RECOVERY_TTL_MS;
  const resendRemainingMs = attempt
    ? passwordRecoveryResendRemainingMs(attempt.sentAt, now)
    : PASSWORD_RECOVERY_RESEND_COOLDOWN_MS;
  const expired = Boolean(attempt) && codeRemainingMs <= 0;

  function switchStage(nextStage: RecoveryStage) {
    setError("");
    setNotice("");
    setStage(nextStage);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);
    const result = await authService.requestPasswordReset(normalizedEmail);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const sentAt = Date.now();
    const nextAttempt = { email: normalizedEmail, sentAt };
    savePasswordRecoveryAttempt(normalizedEmail, sentAt);
    setAttempt(nextAttempt);
    setNow(sentAt);
    setCode("");
    setStage("code");
  }

  async function resendCode() {
    if (!attempt || loading || resendRemainingMs > 0) return;
    setError("");
    setNotice("");
    setLoading(true);
    const result = await authService.requestPasswordReset(attempt.email);
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const sentAt = Date.now();
    const nextAttempt = { ...attempt, sentAt };
    savePasswordRecoveryAttempt(attempt.email, sentAt);
    setAttempt(nextAttempt);
    setNow(sentAt);
    setCode("");
    setNotice(
      "If this email belongs to an AIko account, a fresh 6-digit code is on the way.",
    );
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!attempt) {
      setError("Enter your email again so AIko can send a new reset code.");
      setStage("email");
      return;
    }
    if (expired) {
      setError("That code has expired. Request a fresh code below.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your AIko account email.");
      return;
    }

    setLoading(true);
    const result = await authService.verifyPasswordResetCode(attempt.email, code);
    setLoading(false);
    if (!result.ok) {
      if (passwordRecoveryRemainingMs(attempt.sentAt) <= 0) {
        setNow(Date.now());
        setError("That code has expired. Request a fresh code below.");
      } else {
        setError("That code is incorrect. Check the 6 digits and try again.");
      }
      return;
    }

    setError("");
    setNotice("");
    setStage("password");
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!isStrongEnough(password)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    const result = await authService.updatePassword(password);
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
      return;
    }
    await authService.signOut();
    clearPasswordRecoveryAttempt();
    setLoading(false);
    setStage("done");
  }

  return (
    <AuthShell>
      <div key={stage} className="animate-fade-up">
        {stage === "login" && (
          <>
            <h1 className="mt-12 text-4xl font-semibold tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-3 text-stone-500">
              Continue your language-learning path right where you left it.
            </p>
            <AuthForm mode="login" onForgotPassword={() => switchStage("email")} />
            <p className="mt-8 text-center text-sm text-stone-500">
              New to AIko?{" "}
              <Link
                className="font-semibold text-moss-700 hover:underline"
                href="/signup"
              >
                Create an account
              </Link>
            </p>
          </>
        )}

        {stage === "email" && (
          <>
            <BackButton onClick={() => switchStage("login")} label="Back to login" />
            <span className="mt-8 grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-500">
              <Mail />
            </span>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight">
              Reset your password.
            </h1>
            <p className="mt-3 leading-7 text-stone-500">
              Enter your email and we’ll send a 6-digit password-reset code. The code is valid for 5 minutes.
            </p>
            <form className="mt-8 space-y-5" onSubmit={requestCode}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Email address</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="form-input"
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </label>
              <RecoveryMessage error={error} notice={notice} />
              <Button disabled={loading} className="w-full">
                {loading && <LoaderCircle className="size-4 animate-spin" />}
                {loading ? "Sending code…" : "Send reset code"}
              </Button>
            </form>
            <PrivacyNote />
          </>
        )}

        {stage === "code" && attempt && (
          <>
            <BackButton
              onClick={() => {
                clearPasswordRecoveryAttempt();
                setAttempt(null);
                setCode("");
                switchStage("email");
              }}
              label="Use another email"
            />
            <span className="mt-8 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <ShieldCheck />
            </span>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight">
              Enter your reset code.
            </h1>
            <p className="mt-3 leading-7 text-stone-500">
              If <span className="font-semibold text-ink">{attempt.email}</span> belongs to an AIko account, the 6-digit code will arrive there.
            </p>
            <p
              className={
                expired
                  ? "mt-2 text-sm font-semibold text-red-600"
                  : "mt-2 text-sm font-semibold text-moss-700"
              }
            >
              {expired
                ? "Code expired"
                : `Code expires in ${formatRemainingTime(codeRemainingMs)}`}
            </p>

            <form className="mt-8 space-y-5" onSubmit={verifyCode}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">6-digit code</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="form-input text-center text-2xl font-semibold tracking-[.35em]"
                  placeholder="000000"
                  aria-label="Password reset code"
                />
              </label>
              <RecoveryMessage error={error} notice={notice} />
              <Button disabled={loading || expired} className="w-full">
                {loading && <LoaderCircle className="size-4 animate-spin" />}
                {loading ? "Checking code…" : "Verify code"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-stone-500">
              <p>Didn’t receive the code?</p>
              <button
                type="button"
                onClick={() => void resendCode()}
                disabled={loading || resendRemainingMs > 0}
                className="mt-1 font-semibold text-moss-700 hover:underline disabled:cursor-not-allowed disabled:text-stone-400 disabled:no-underline"
              >
                {resendRemainingMs > 0
                  ? `Resend code in ${Math.ceil(resendRemainingMs / 1000)}s`
                  : "Resend code"}
              </button>
            </div>
            <SupportNote />
          </>
        )}

        {stage === "password" && (
          <>
            <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <KeyRound />
            </span>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight">
              Choose a new password.
            </h1>
            <p className="mt-3 leading-7 text-stone-500">
              Code verified. Create a new password for your AIko account.
            </p>
            <form className="mt-8 space-y-5" onSubmit={updatePassword}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">New password</span>
                <span className="relative block">
                  <input
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="form-input pr-12"
                    autoComplete="new-password"
                  />
                  <PasswordVisibility
                    shown={showPassword}
                    onToggle={() => setShowPassword((value) => !value)}
                  />
                </span>
                <PasswordStrengthMeter password={password} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">
                  Confirm password
                </span>
                <span className="relative block">
                  <input
                    required
                    minLength={PASSWORD_MIN_LENGTH}
                    type={showConfirmation ? "text" : "password"}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="form-input pr-12"
                    autoComplete="new-password"
                  />
                  <PasswordVisibility
                    shown={showConfirmation}
                    onToggle={() => setShowConfirmation((value) => !value)}
                  />
                </span>
              </label>
              <RecoveryMessage error={error} notice={notice} />
              <Button disabled={loading} className="w-full">
                {loading && <LoaderCircle className="size-4 animate-spin" />}
                {loading ? "Updating…" : "Update password"}
              </Button>
            </form>
          </>
        )}

        {stage === "done" && (
          <>
            <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
              <CheckCircle2 />
            </span>
            <h1 className="mt-7 text-4xl font-semibold tracking-tight">
              Password changed.
            </h1>
            <p className="mt-3 leading-7 text-stone-500">
              Your new password is ready. Sign in again with your updated password.
            </p>
            <Button
              type="button"
              className="mt-8 w-full"
              onClick={() => {
                setEmail("");
                setAttempt(null);
                setCode("");
                setPassword("");
                setConfirmation("");
                switchStage("login");
              }}
            >
              Return to login
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-moss-700 hover:underline"
    >
      <ArrowLeft className="size-4" />
      {label}
    </button>
  );
}

function RecoveryMessage({ error, notice }: { error: string; notice: string }) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
      >
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p
        role="status"
        className="rounded-xl bg-moss-50 px-4 py-3 text-sm font-semibold text-moss-700"
      >
        {notice}
      </p>
    );
  }
  return null;
}

function PrivacyNote() {
  return (
    <p className="mt-5 text-center text-xs leading-5 text-stone-400">
      For privacy, AIko won’t reveal whether an email address is registered. A reset code is only delivered when a matching account exists.
    </p>
  );
}

function SupportNote() {
  return (
    <p className="mt-6 text-center text-xs leading-5 text-stone-400">
      Need help? Email{" "}
      <a className="font-semibold text-moss-700 hover:underline" href={AIKO_SUPPORT_MAILTO}>
        {AIKO_SUPPORT_EMAIL}
      </a>
      .
    </p>
  );
}

function formatRemainingTime(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function PasswordVisibility({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-50"
      aria-label={shown ? "Hide password" : "Show password"}
    >
      {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
