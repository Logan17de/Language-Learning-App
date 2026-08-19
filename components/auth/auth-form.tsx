"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleIdentityButton } from "@/components/auth/google-identity-button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import {
  applyClientIdentity,
  hydrateClientSession,
} from "@/lib/auth/client-session";
import { getBackendMode } from "@/lib/supabase/config";
import {
  isStrongEnough,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "@/lib/auth/password-strength";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const signIn = useAppStore((state) => state.signIn);
  const onboardingComplete = useAppStore((state) => state.onboarding.completed);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const backendMode = getBackendMode();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    const messages: Record<string, string> = {
      "no-google-account":
        "No AIko account is connected to this Google address. Create an account first, then use Google to log in.",
      "backend-not-configured":
        "Authentication is not configured for this deployment.",
      "auth-callback":
        "Authentication could not be completed. Please try again.",
    };
    const message = code ? messages[code] : null;
    if (!message) return;
    const timer = window.setTimeout(() => setError(message), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const requestedNext = () => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("next");
    return value?.startsWith("/") && !value.startsWith("//") ? value : null;
  };

  function destination(accountOnboardingComplete: boolean): string {
    return accountOnboardingComplete
      ? (requestedNext() ?? "/home")
      : "/onboarding";
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && !isStrongEnough(password)) {
      setError(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }
    setLoading(true);
    if (backendMode === "demo") {
      window.setTimeout(() => {
        signIn(mode === "signup" ? name : undefined);
        router.push(
          mode === "signup" || !onboardingComplete
            ? "/onboarding"
            : (requestedNext() ?? "/home"),
        );
      }, 650);
      return;
    }

    if (mode === "signup") {
      const result = await authService.signUp(email, password, name);
      if (!result.ok) {
        setLoading(false);
        setError(result.error.message);
        return;
      }
      if (result.data.confirmationRequired) {
        setLoading(false);
        router.push("/login?confirmation=required");
        return;
      }

      const session = await hydrateClientSession();
      setLoading(false);
      if (!session.ok || !session.data) {
        setError(
          session.ok
            ? "Your account was created, but AIko could not load your profile. Please sign in again."
            : session.error.message,
        );
        return;
      }
      router.replace(destination(session.data.onboardingComplete));
      return;
    }

    const result = await authService.signIn(email, password);
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
    if (backendMode === "demo") {
      setError(
        "Google sign-in becomes available when Supabase Auth is connected.",
      );
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

    const session = await hydrateClientSession();
    setLoading(false);
    if (!session.ok || !session.data) {
      setError(
        session.ok
          ? "Google sign-in succeeded, but AIko could not load your learner profile. Please try again."
          : session.error.message,
      );
      return;
    }

    router.replace(destination(session.data.onboardingComplete));
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
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
          disabled={loading}
          onClick={() =>
            setError(
              "Google sign-in becomes available when Supabase Auth is connected.",
            )
          }
        >
          {mode === "login"
            ? "Log in with Google"
            : "Create account with Google"}
        </Button>
      )}
      <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[.16em] text-stone-300">
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
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="form-input"
            placeholder="Hana"
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
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full text-stone-400 hover:bg-stone-50"
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
          <p className="mt-2 text-xs leading-5 text-stone-400">
            Password strength is checked when you create or reset a password.
            Enter the password for your existing AIko account here.
          </p>
        )}
      </label>
      {mode === "login" && (
        <div className="text-right">
          <a
            href="/forgot-password"
            className="text-sm font-semibold text-moss-700 hover:underline"
          >
            Forgot password?
          </a>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      <Button className="w-full" disabled={loading}>
        {loading && <LoaderCircle className="size-4 animate-spin" />}
        {loading
          ? "Preparing your path…"
          : mode === "login"
            ? "Log in"
            : "Create my account"}
      </Button>
      <p className="text-center text-xs leading-5 text-stone-400">
        {backendMode === "demo"
          ? "Demo mode: email sign-in is local; Google requires Supabase Auth."
          : "Your account is secured by Supabase Auth."}
      </p>
    </form>
  );
}
