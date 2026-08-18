"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, LoaderCircle, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import {
  clearPendingSignupConfirmation,
  readPendingSignupConfirmation,
  savePendingSignupConfirmation,
  signupConfirmationResendRemainingMs,
} from "@/lib/auth/pending-signup-confirmation";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";
import { useAppStore } from "@/store/app-store";

type ConfirmationState = "required" | "expired" | "failed" | null;

export function SignupFlow() {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const backendSessionChecked = useAppStore((state) => state.backendSessionChecked);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const onboardingComplete = useAppStore((state) => state.onboarding.completed);
  const [requestedNext, setRequestedNext] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState>(null);
  const [redirectTargetReady, setRedirectTargetReady] = useState(false);
  const [email, setEmail] = useState("");
  const [remainingMs, setRemainingMs] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pending = readPendingSignupConfirmation();
    const next =
      safeInternalRedirect(params.get("next")) ?? pending?.next ?? null;
    const code = params.get("error");
    const state: ConfirmationState =
      params.get("confirmation") === "required"
        ? "required"
        : code === "confirmation-expired"
          ? "expired"
          : code === "confirmation-failed"
            ? "failed"
            : null;

    setRequestedNext(next);
    setConfirmationState(state);
    if (pending) {
      setEmail(pending.email);
      setRemainingMs(signupConfirmationResendRemainingMs(pending.sentAt));
    }
    setRedirectTargetReady(true);
  }, []);

  useEffect(() => {
    if (remainingMs <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingMs((value) => Math.max(0, value - 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remainingMs]);

  useEffect(() => {
    if (
      !redirectTargetReady ||
      !hasHydrated ||
      !backendSessionChecked ||
      !isAuthenticated
    ) {
      return;
    }

    const destination = onboardingComplete
      ? (requestedNext ?? "/home")
      : requestedNext
        ? `/onboarding?next=${encodeURIComponent(requestedNext)}`
        : "/onboarding";
    router.replace(destination);
  }, [
    backendSessionChecked,
    hasHydrated,
    isAuthenticated,
    onboardingComplete,
    redirectTargetReady,
    requestedNext,
    router,
  ]);

  async function resendConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remainingMs > 0) return;
    setError("");
    setSent(false);
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address you used to create your AIko account.");
      return;
    }

    setLoading(true);
    const result = await authService.resendSignUpConfirmation(
      normalizedEmail,
      requestedNext ?? undefined,
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    const pending = savePendingSignupConfirmation(
      normalizedEmail,
      requestedNext,
    );
    setEmail(pending.email);
    setRemainingMs(signupConfirmationResendRemainingMs(pending.sentAt));
    setSent(true);
  }

  function restartSignup() {
    clearPendingSignupConfirmation();
    setConfirmationState(null);
    setError("");
    setSent(false);
    router.replace(withSafeNext("/signup", requestedNext));
  }

  if (!redirectTargetReady || !hasHydrated || !backendSessionChecked) {
    return (
      <AuthShell>
        <div className="grid min-h-72 place-items-center text-center" aria-live="polite">
          <div>
            <LoaderCircle className="mx-auto size-7 animate-spin text-moss-700" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold text-stone-500">
              Checking your account status…
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (isAuthenticated) {
    return (
      <AuthShell>
        <div className="grid min-h-72 place-items-center text-center" aria-live="polite">
          <div>
            <LoaderCircle className="mx-auto size-7 animate-spin text-moss-700" aria-hidden="true" />
            <p className="mt-4 text-sm font-semibold text-stone-500">
              Taking you back to your AIko account…
            </p>
          </div>
        </div>
      </AuthShell>
    );
  }

  if (confirmationState) {
    const heading =
      confirmationState === "required"
        ? "Check your email."
        : confirmationState === "expired"
          ? "That confirmation link expired."
          : "That confirmation link didn’t work.";
    const detail =
      confirmationState === "required"
        ? "We sent a confirmation link to your email. Confirm your address before logging in."
        : "Enter the email address you used to create your account and we’ll send a fresh confirmation link.";

    return (
      <AuthShell>
        <span className="mt-12 grid size-14 place-items-center rounded-2xl bg-moss-100 text-moss-700">
          <MailCheck aria-hidden="true" />
        </span>
        <h1 className="mt-7 text-4xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-3 leading-7 text-stone-500">{detail}</p>

        <form className="mt-8 space-y-5" onSubmit={resendConfirmation}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-ink">
              Email address
            </span>
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

          {sent && (
            <p
              role="status"
              className="flex gap-2 rounded-xl bg-moss-50 px-4 py-3 text-sm font-semibold leading-6 text-moss-800"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              If this address has a pending AIko signup, a new confirmation email has been sent.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700"
            >
              {error}
            </p>
          )}

          <Button className="w-full" disabled={loading || remainingMs > 0}>
            {loading
              ? "Sending…"
              : remainingMs > 0
                ? `Resend available in ${Math.ceil(remainingMs / 1000)}s`
                : "Resend confirmation email"}
          </Button>
        </form>

        <div className="mt-6 space-y-3 text-center text-sm">
          <p className="text-stone-600">
            Already confirmed?{" "}
            <Link
              href={withSafeNext("/login", requestedNext)}
              className="font-semibold text-moss-700 hover:underline"
            >
              Log in
            </Link>
          </p>
          <button
            type="button"
            onClick={restartSignup}
            className="font-semibold text-moss-700 hover:underline"
          >
            Use a different email
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">
        Build language skills that last.
      </h1>
      <p className="mt-3 text-stone-500">
        Tell us a little about your goals after creating your account.
      </p>
      <AuthForm mode="signup" />
      <p className="mt-8 text-center text-sm text-stone-500">
        Already have an account?{" "}
        <Link
          className="font-semibold text-moss-700 hover:underline"
          href={withSafeNext("/login", requestedNext)}
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
