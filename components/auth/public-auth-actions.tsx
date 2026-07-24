"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

function usePublicAuthState() {
  const router = useRouter();
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const clearLocalSession = useAppStore((state) => state.signOut);
  const backendMode = getBackendMode();
  const [backendSignedIn, setBackendSignedIn] = useState<boolean | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (backendMode !== "supabase") return;

    let active = true;
    void authService.getIdentity().then((result) => {
      if (active) setBackendSignedIn(result.ok && Boolean(result.data));
    });

    const unsubscribe = authService.subscribe((signedIn) => {
      if (active) setBackendSignedIn(signedIn);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [backendMode]);

  const resolved = backendMode === "supabase" ? backendSignedIn !== null : hasHydrated;
  const signedIn =
    backendMode === "supabase" ? backendSignedIn === true : hasHydrated && isAuthenticated;

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
    setIsSigningOut(false);
    router.refresh();
  }

  return { isSigningOut, resolved, signedIn, signOut };
}

export function PublicHeaderActions() {
  const { isSigningOut, resolved, signedIn, signOut } = usePublicAuthState();

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
      <>
        <Button
          type="button"
          variant="ghost"
          className="min-h-10 px-3 text-xs sm:px-5 sm:text-sm"
          onClick={() => void signOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
        <ButtonLink href="/home" className="min-h-10 px-3 text-xs sm:px-5 sm:text-sm">
          Go to dashboard
        </ButtonLink>
      </>
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
  className,
  variant = "primary",
}: {
  signedOutLabel: string;
  signedInLabel?: string;
  signedInHref?: string;
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

  return (
    <ButtonLink
      href={signedIn ? signedInHref : "/signup"}
      variant={variant}
      className={className}
    >
      {signedIn ? signedInLabel : signedOutLabel}
      <ArrowRight
        className="size-4 transition-transform group-hover:translate-x-1"
        aria-hidden="true"
      />
    </ButtonLink>
  );
}
