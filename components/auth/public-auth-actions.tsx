"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Bot } from "lucide-react";
import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

type PublicPlan = "free" | "pro";

function toPublicPlan(plan: string | undefined): PublicPlan {
  return plan && plan !== "free" ? "pro" : "free";
}

function usePublicAuthState() {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const localSubscriptionPlan = useAppStore((state) => state.subscription.plan);
  const clearLocalSession = useAppStore((state) => state.signOut);
  const backendMode = getBackendMode();
  const [backendSignedIn, setBackendSignedIn] = useState<boolean | null>(null);
  const [backendPlan, setBackendPlan] = useState<PublicPlan | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (backendMode !== "supabase") return;

    let active = true;

    async function syncIdentity() {
      const result = await authService.getIdentity();
      if (!active) return;

      const identity = result.ok ? result.data : null;
      setBackendSignedIn(Boolean(identity));
      setBackendPlan(identity ? toPublicPlan(identity.subscriptionPlan) : null);
    }

    void syncIdentity();

    const unsubscribe = authService.subscribe((signedIn) => {
      if (!active) return;

      setBackendSignedIn(signedIn);
      if (signedIn) void syncIdentity();
      else setBackendPlan(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [backendMode]);

  const resolved =
    backendMode === "supabase"
      ? backendSignedIn !== null && (!backendSignedIn || backendPlan !== null)
      : hasHydrated;
  const signedIn =
    backendMode === "supabase" ? backendSignedIn === true : hasHydrated && isAuthenticated;
  const plan: PublicPlan =
    backendMode === "supabase"
      ? (backendPlan ?? "free")
      : localSubscriptionPlan === "premium"
        ? "pro"
        : "free";

  async function signOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    if (backendMode === "supabase") {
      const result = await authService.signOut();
      if (!result.ok) {
        setIsSigningOut(false);
        return;
      }
    }

    clearLocalSession();
    setBackendSignedIn(false);
    setBackendPlan(null);
    setIsSigningOut(false);
    router.refresh();
  }

  return { isSigningOut, plan, resolved, signedIn, signOut };
}

export function PublicHeaderActions() {
  const { resolved, signedIn } = usePublicAuthState();

  if (!resolved) {
    return (
      <div
        className="h-10 w-56 animate-pulse rounded-full bg-stone-100"
        aria-label="Checking account session"
      />
    );
  }

  if (signedIn) {
    return (
      <ButtonLink href="/home" className="min-h-10 px-3 text-xs sm:px-5 sm:text-sm">
        <span className="sm:hidden">Dashboard</span>
        <span className="hidden sm:inline">Go to dashboard</span>
      </ButtonLink>
    );
  }

  return (
    <>
      <ButtonLink
        href="/login"
        variant="ghost"
        className="min-h-10 px-3 text-xs sm:px-5 sm:text-sm"
      >
        Sign in
      </ButtonLink>
      <ButtonLink href="/signup" className="min-h-10 px-3 text-xs sm:px-5 sm:text-sm">
        Create account
      </ButtonLink>
    </>
  );
}

export function PublicPrimaryAction({
  signedOutLabel,
  signedInLabel = "Go to dashboard",
  signedInHref = "/home",
  hideWhenSignedIn = false,
  showAiIcon = false,
  className,
  variant = "primary",
}: {
  signedOutLabel: string;
  signedInLabel?: string;
  signedInHref?: string;
  hideWhenSignedIn?: boolean;
  showAiIcon?: boolean;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "dark";
}) {
  const { resolved, signedIn } = usePublicAuthState();

  if (!resolved) {
    return (
      <span
        className="inline-flex min-h-12 w-52 animate-pulse rounded-full bg-moss-100"
        aria-label="Checking account session"
      />
    );
  }

  if (signedIn && hideWhenSignedIn) {
    return null;
  }

  return (
    <ButtonLink
      href={signedIn ? signedInHref : "/signup"}
      variant={variant}
      className={className}
    >
      {showAiIcon && <Bot className="size-4" aria-hidden="true" />}
      {signedIn ? signedInLabel : signedOutLabel}
      <ArrowRight
        className="size-4 transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </ButtonLink>
  );
}
