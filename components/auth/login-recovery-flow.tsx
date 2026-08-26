"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import {
  safeInternalRedirect,
  withSafeNext,
} from "@/lib/auth/safe-internal-redirect";
import { useAppStore } from "@/store/app-store";

export function LoginRecoveryFlow() {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const backendSessionChecked = useAppStore((state) => state.backendSessionChecked);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const onboardingComplete = useAppStore((state) => state.onboarding.completed);
  const [requestedNext, setRequestedNext] = useState<string | null>(null);
  const [redirectTargetReady, setRedirectTargetReady] = useState(false);

  useEffect(() => {
    let active = true;
    // Deferred off the synchronous effect body to avoid cascading renders.
    void Promise.resolve().then(() => {
      if (!active) return;
      const next = safeInternalRedirect(
        new URLSearchParams(window.location.search).get("next"),
      );
      setRequestedNext(next);
      setRedirectTargetReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

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

  if (
    redirectTargetReady &&
    hasHydrated &&
    backendSessionChecked &&
    isAuthenticated
  ) {
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

  return (
    <AuthShell>
      <h1 className="mt-12 text-4xl font-semibold tracking-tight">Welcome back.</h1>
      <p className="mt-3 text-stone-500">
        Continue your language-learning path right where you left it.
      </p>
      <AuthForm mode="login" />
      <p className="mt-8 text-center text-sm text-stone-500">
        New to AIko?{" "}
        <Link
          className="font-semibold text-moss-700 hover:underline"
          href={withSafeNext("/signup", requestedNext)}
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
