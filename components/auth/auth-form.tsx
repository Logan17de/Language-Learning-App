"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import { prepareAccountScope } from "@/lib/auth/account-scope";
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
  const syncBackendIdentity = useAppStore((state) => state.syncBackendIdentity);
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
      "oauth-verifier":
        "The temporary Google sign-in session was lost. Start again in the same browser without clearing cookies.",
      "oauth-expired":
        "The Google sign-in request expired or was already used. Please start again.",
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

    const next = requestedNext;
    const onboardingHref = next
      ? `/onboarding?next=${encodeURIComponent(next)}`
      : "/onboarding";

    setLoading(true);
    let accountOnboardingComplete = false;
    if (mode === "signup") {
      const result = await authService.signUp(
        normalizedEmail,
        password,
        normalizedName,
        next ?? undefined,
      );
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
      if (result.data.confirmationRequired) {
        savePendingSignupConfirmation(normalizedEmail, next);
        router.push(withSafeNext("/signup?confirmation=required", next));
        return;
      }
      if (!result.data.identity) {
        setError("Your new account could not be initialized. Please try again.");
        return;
      }
      accountOnboardingComplete = result.data.identity.onboardingComplete;
      prepareAccountScope(
        result.data.identity.id,
        useAppStore.getState().signOut,
      );
      syncBackendIdentity(
        result.data.identity.id,
        result.data.identity.displayName,
        result.data.identity.email,
        result.data.identity.onboardingComplete,
      );
    } else {
      const result = await authService.signIn(normalizedEmail, password);
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
      accountOnboardingComplete = result.data.onboardingComplete;
      prepareAccountScope(result.data.id, useAppStore.getState().signOut);
      syncBackendIdentity(
        result.data.id,
        result.data.displayName,
        result.data.email,
        result.data.onboardingComplete,
      );
    }
    router.push(
      !accountOnboardingComplete ? onboardingHref : (next ?? "/home"),
    );
    router.refresh();
  }

  async function googleSignIn() {
    setError("");
    setNotice("");
    if (backendMode !== "supabase") {
      setError("Authentication is not configured for this deployment.");
      return;
    }
    setLoading(true);
    const result = await authService.signInWithGoogle(
      mode,
      requestedNext ?? undefined,
    );
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
    }
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
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={loading || backendMode !== "supabase"}
        onClick={googleSignIn}
      >
        <GoogleMark />
        {mode === "login"
          ? "Log in with Google"
          : "Create account with Google"}
      </Button>
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
          ? mode === "login" ? "Logging in…" : "Creating account…"
          : mode === "login"
            ? "Log in"
            : "Create my account"}
      </Button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.3L6.5 14Z"
      />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 6Z"
      />
    </svg>
  );
}
