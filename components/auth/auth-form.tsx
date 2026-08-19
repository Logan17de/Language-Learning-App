"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { GoogleIdentityButton } from "@/components/auth/google-identity-button";
import { Button } from "@/components/ui/button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { authService } from "@/lib/auth/auth-service";
import { applyClientIdentity } from "@/lib/auth/client-session";
import { savePendingSignupConfirmation } from "@/lib/auth/pending-signup-confirmation";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";
import { getBackendMode } from "@/lib/supabase/config";
import {
  isStrongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";

const FIRST_NAME_MAX_LENGTH = 50;

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestedNext, setRequestedNext] = useState<string | null>(null);
  const backendMode = getBackendMode();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("error");
    const messages: Record<string, string> = {
      "no-google-account":
        "No AIko account is linked to this Google account. Create an account first.",
      "oauth-cancelled":
        "Google sign-in was cancelled. You can try again when you’re ready.",
      "oauth-exchange":
        "Google sign-in could not be completed. Please try again.",
      "backend-not-configured":
        "Authentication is not configured for this deployment.",
      "auth-callback":
        "Account setup could not be completed. Please try again.",
      "account-inactive":
        "This account is not active. Contact support if you think this is a mistake.",
      "profile-load":
        "Your learner profile could not be verified. Please try signing in again.",
      "preferences-load":
        "Your learning preferences could not be loaded. Please try signing in again.",
    };
    const message = code ? messages[code] : null;
    const confirmationRequired = params.get("confirmation") === "required";
    const next = safeInternalRedirect(params.get("next"));
    const timer = window.setTimeout(() => {
      setRequestedNext(next);
      if (message) setError(message);
      if (confirmationRequired) {
        setNotice(
          "Account created. Check your email and confirm your address before logging in.",
        );
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function destination(accountOnboardingComplete: boolean): string {
    if (accountOnboardingComplete) return requestedNext ?? "/home";
    return requestedNext
      ? `/onboarding?next=${encodeURIComponent(requestedNext)}`
      : "/onboarding";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (backendMode !== "supabase") {
      setError("Authentication is not configured for this deployment.");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedName = name.trim();
    if (mode === "signup") {
      if (!normalizedName) {
        setError("Enter your first name.");
        return;
      }
      if (normalizedName.length > FIRST_NAME_MAX_LENGTH) {
        setError(`First name must be ${FIRST_NAME_MAX_LENGTH} characters or fewer.`);
        return;
      }
      if (!isStrongEnough(password)) {
        setError(PASSWORD_REQUIREMENTS_MESSAGE);
        return;
      }
    }

    setLoading(true);
    if (mode === "signup") {
      const result = await authService.signUp(
        normalizedEmail,
        password,
        normalizedName,
        requestedNext ?? undefined,
      );
      if (!result.ok) {
        setLoading(false);
        setError(result.error.message);
        return;
      }
      if (result.data.confirmationRequired) {
        setLoading(false);
        savePendingSignupConfirmation(normalizedEmail, requestedNext);
        router.push(
          withSafeNext("/signup?confirmation=required", requestedNext),
        );
        return;
      }
      if (!result.data.identity) {
        setLoading(false);
        setError("Your new account could not be initialized. Please try again.");
        return;
      }

      await applyClientIdentity(result.data.identity);
      setLoading(false);
      router.replace(destination(result.data.identity.onboardingComplete));
      return;
    }

    const result = await authService.signIn(normalizedEmail, password);
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
      return;
    }

    await applyClientIdentity(result.data);
    setLoading(false);
    router.replace(destination(result.data.onboardingComplete));
  }

  async function googleSignIn(credential: string, nonce: string) {
    setError("");
    setNotice("");
    if (backendMode !== "supabase") {
      setError("Authentication is not configured for this deployment.");
      return;
    }

    setLoading(true);
    const result = await authService.signInWithGoogleIdToken(
      mode,
      credential,
      nonce,
    );
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
      return;
    }

    await applyClientIdentity(result.data);
    setLoading(false);
    router.replace(destination(result.data.onboardingComplete));
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      {backendMode !== "supabase" && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold leading-6 text-red-700"
        >
          Authentication is unavailable because this deployment is missing its backend configuration.
        </p>
      )}
      {backendMode === "supabase" ? (
        <GoogleIdentityButton
          mode={mode}
          disabled={loading}
          onCredential={googleSignIn}
          onError={setError}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled
        >
          {mode === "login"
            ? "Log in with Google"
            : "Create account with Google"}
        </Button>
      )}
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[.16em] text-stone-500">
        <span className="h-px flex-1 bg-stone-200" />
        or use email
        <span className="h-px flex-1 bg-stone-200" />
      </div>
      {mode === "signup" && (
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-ink">
            First name
          </span>
          <input
            required
            maxLength={FIRST_NAME_MAX_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="form-input"
            placeholder="Your name"
            autoComplete="given-name"
          />
        </label>
      )}
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
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-ink">
          Password
        </span>
        <span className="relative block">
          <input
            required
            minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : 6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type={showPassword ? "text" : "password"}
            className="form-input pr-12"
            placeholder={
              mode === "signup"
                ? "Create a strong password"
                : "Enter your password"
            }
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-500 hover:bg-stone-50"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-5" />
            ) : (
              <Eye className="size-5" />
            )}
          </button>
        </span>
        {mode === "signup" ? (
          <PasswordStrengthMeter password={password} />
        ) : (
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Password strength is checked when you create or reset a password.
            Enter the password for your existing AIko account here.
          </p>
        )}
      </label>
      {mode === "login" && (
        <div className="text-right">
          <a
            href={withSafeNext("/forgot-password", requestedNext)}
            className="text-sm font-semibold text-moss-700 hover:underline"
          >
            Forgot password?
          </a>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="flex gap-2 rounded-xl bg-moss-50 px-4 py-3 text-sm font-semibold leading-6 text-moss-800"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={loading || backendMode !== "supabase"}
      >
        {loading && <LoaderCircle className="size-4 animate-spin" />}
        {loading
          ? mode === "login"
            ? "Logging in…"
            : "Creating account…"
          : mode === "login"
            ? "Log in"
            : "Create my account"}
      </Button>
    </form>
  );
}
