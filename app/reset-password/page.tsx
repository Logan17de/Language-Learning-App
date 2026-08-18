"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { Button, ButtonLink } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import {
  clearPasswordRecoveryAttempt,
  PASSWORD_RECOVERY_TTL_MS,
  passwordRecoveryRemainingMs,
  readPasswordRecoveryAttempt,
  type PasswordRecoveryAttempt,
} from "@/lib/auth/password-recovery";
import {
  isStrongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";
import { AIKO_SUPPORT_EMAIL, AIKO_SUPPORT_MAILTO } from "@/lib/contact";

export default function ResetPasswordPage() {
  const [attempt, setAttempt] = useState<PasswordRecoveryAttempt | null>();
  const [remainingMs, setRemainingMs] = useState(PASSWORD_RECOVERY_TTL_MS);
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [requestedNext, setRequestedNext] = useState<string | null>(null);

  useEffect(() => {
    const current = readPasswordRecoveryAttempt();
    setAttempt(current);
    if (current) setRemainingMs(passwordRecoveryRemainingMs(current.sentAt));
    setRequestedNext(
      safeInternalRedirect(
        new URLSearchParams(window.location.search).get("next"),
      ),
    );
  }, []);

  useEffect(() => {
    if (!attempt || verified) return;
    const updateRemaining = () =>
      setRemainingMs(passwordRecoveryRemainingMs(attempt.sentAt));
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [attempt, verified]);

  const expired = Boolean(attempt) && remainingMs <= 0;

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!attempt) {
      setError("Start password recovery again so AIko can send you a new code.");
      return;
    }
    if (expired) {
      setError("That code has expired. Request a new password-reset code.");
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
        setRemainingMs(0);
        setError("That code has expired. Request a new password-reset code.");
      } else {
        // Supabase can return an intentionally ambiguous "expired or invalid" token
        // message. Inside AIko's still-active five-minute window, treat a rejected
        // six-digit value as incorrect; the server remains the source of truth.
        setError("That code is incorrect. Check the 6 digits and try again.");
      }
      return;
    }

    clearPasswordRecoveryAttempt();
    setVerified(true);
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!verified) {
      setError("Verify your password-reset code first.");
      return;
    }
    if (!isStrongEnough(password)) return setError(PASSWORD_REQUIREMENTS_MESSAGE);
    if (password !== confirmation) return setError("The passwords do not match.");

    setLoading(true);
    const result = await authService.updatePassword(password);
    if (!result.ok) {
      setLoading(false);
      return setError(result.error.message);
    }
    await authService.signOut();
    setLoading(false);
    setCompleted(true);
  }

  if (attempt === undefined) {
    return (
      <AuthShell>
        <p className="mt-12 text-sm text-stone-500">Preparing password recovery…</p>
      </AuthShell>
    );
  }

  if (completed) {
    return (
      <AuthShell>
        <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
          <CheckCircle2 />
        </span>
        <h1 className="mt-7 text-4xl font-semibold tracking-tight">Password changed.</h1>
        <p className="mt-3 leading-7 text-stone-500">
          Your new password is ready. Sign in again with your updated password.
        </p>
        <ButtonLink href={withSafeNext("/login", requestedNext)} className="mt-8 w-full">
          Return to login
        </ButtonLink>
      </AuthShell>
    );
  }

  if (!attempt) {
    return (
      <AuthShell>
        <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-persimmon-50 text-persimmon-600">
          <KeyRound />
        </span>
        <h1 className="mt-7 text-4xl font-semibold tracking-tight">Request a new code.</h1>
        <p className="mt-3 leading-7 text-stone-500">
          There isn’t an active password-reset request in this browser. Start again and we’ll email you a fresh 6-digit code.
        </p>
        <ButtonLink href={withSafeNext("/forgot-password", requestedNext)} className="mt-8 w-full">
          Start password recovery
        </ButtonLink>
        <p className="mt-5 text-center text-sm text-stone-600">
          <Link
            href={withSafeNext("/login", requestedNext)}
            className="font-semibold text-moss-700 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (!verified) {
    return (
      <AuthShell>
        <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
          <ShieldCheck />
        </span>
        <h1 className="mt-7 text-4xl font-semibold tracking-tight">Enter your reset code.</h1>
        <p className="mt-3 leading-7 text-stone-500">
          We sent a 6-digit code to <span className="font-semibold text-ink">{attempt.email}</span>.
        </p>
        <p className={expired ? "mt-2 text-sm font-semibold text-red-600" : "mt-2 text-sm font-semibold text-moss-700"}>
          {expired ? "Code expired" : `Code expires in ${formatRemainingTime(remainingMs)}`}
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
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              {error}
            </p>
          )}
          <Button disabled={loading || expired} className="w-full">
            {loading ? "Checking code…" : "Verify code"}
          </Button>
        </form>

        {expired && (
          <ButtonLink
            href={withSafeNext("/forgot-password", requestedNext)}
            variant="secondary"
            className="mt-3 w-full"
          >
            Request a new code
          </ButtonLink>
        )}
        <p className="mt-6 text-center text-xs leading-5 text-stone-600">
          Need help? Email{" "}
          <a className="font-semibold text-moss-700 hover:underline" href={AIKO_SUPPORT_MAILTO}>
            {AIKO_SUPPORT_EMAIL}
          </a>
          .
        </p>
        <p className="mt-3 text-center text-sm text-stone-600">
          <Link
            href={withSafeNext("/login", requestedNext)}
            className="font-semibold text-moss-700 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
        <KeyRound />
      </span>
      <h1 className="mt-7 text-4xl font-semibold tracking-tight">Choose a new password.</h1>
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
          <span className="mb-2 block text-sm font-semibold">Confirm password</span>
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
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        )}
        <Button disabled={loading} className="w-full">
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthShell>
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
      className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-600 hover:bg-stone-50"
      aria-label={shown ? "Hide password" : "Show password"}
    >
      {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}
