"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordStrengthMeter } from "@/components/auth/password-strength-meter";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { isStrongEnough } from "@/lib/auth/password-strength";

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
  const requestedNext = () => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("next");
    return value?.startsWith("/") && !value.startsWith("//") ? value : null;
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "signup" && !isStrongEnough(password)) {
      setError(
        "Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.",
      );
      return;
    }
    setLoading(true);
    if (backendMode === "demo") {
      window.setTimeout(() => {
        signIn(mode === "signup" ? name : undefined);
        const next = requestedNext();
        router.push(
          mode === "signup" || !onboardingComplete
            ? "/onboarding"
            : (next ?? "/home"),
        );
      }, 650);
      return;
    }

    let accountOnboardingComplete = false;
    if (mode === "signup") {
      const result = await authService.signUp(email, password, name);
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
      if (result.data.confirmationRequired) {
        router.push("/login?confirmation=required");
        return;
      }
      signIn(name);
    } else {
      const result = await authService.signIn(email, password);
      setLoading(false);
      if (!result.ok) return setError(result.error.message);
      accountOnboardingComplete = result.data.onboardingComplete;
      signIn(result.data.displayName);
    }
    router.push(
      mode === "signup" || !accountOnboardingComplete
        ? "/onboarding"
        : (requestedNext() ?? "/home"),
    );
    router.refresh();
  }

  async function googleSignIn() {
    setError("");
    if (backendMode === "demo") {
      setError(
        "Google sign-in becomes available when Supabase Auth is connected.",
      );
      return;
    }
    setLoading(true);
    const result = await authService.signInWithGoogle(
      requestedNext() ?? undefined,
    );
    if (!result.ok) {
      setLoading(false);
      setError(result.error.message);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={submit}>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={loading}
        onClick={googleSignIn}
      >
        <GoogleMark />
        Continue with Google
      </Button>
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
            minLength={mode === "signup" ? 12 : 6}
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
