"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
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
  const [backendSignedIn, setBackendSignedIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    if (backendMode !== "supabase") return;

    let active = true;

    // Public entry actions should never wait on a profile/database lookup. Supabase
    // session state is enough to choose between signed-out CTAs and dashboard actions.
    void authService.hasSession().then((signedIn) => {
      if (active) setBackendSignedIn(signedIn);
    });

    const unsubscribe = authService.subscribe((signedIn) => {
      if (active) setBackendSignedIn(signedIn);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [backendMode]);

  const signedIn =
    backendMode === "supabase"
      ? backendSignedIn
      : hasHydrated && isAuthenticated;

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

  return { isSigningOut, signedIn, signOut };
}

export function PublicHeaderActions() {
  const { isSigningOut, signedIn, signOut } = usePublicAuthState();

  if (signedIn) {
    return (
      <>
        <Button
          type="button"
          variant="ghost"
          className="px-2 text-xs sm:px-4 sm:text-sm"
          onClick={() => void signOut()}
          disabled={isSigningOut}
        >
          {isSigningOut ? "Signing out…" : "Sign out"}
        </Button>
        <ButtonLink href="/home" className="px-3 text-xs sm:px-5 sm:text-sm">
          <span className="sm:hidden">Dashboard</span>
          <span className="hidden sm:inline">Go to dashboard</span>
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <ButtonLink href="/login" variant="ghost" className="px-3 text-xs sm:px-5 sm:text-sm">
        Sign in
      </ButtonLink>
      <ButtonLink href="/signup" className="px-3 text-xs sm:px-5 sm:text-sm">
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
  const { signedIn } = usePublicAuthState();

  if (signedIn && hideWhenSignedIn) {
    return null;
  }

  return (
    <ButtonLink
      href={signedIn ? signedInHref : "/signup"}
      variant={variant}
      className={className}
    >
      {showAiIcon && <Sparkles className="size-4" aria-hidden="true" />}
      {signedIn ? signedInLabel : signedOutLabel}
      <ArrowRight
        className="size-4 transition-transform duration-180 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </ButtonLink>
  );
}
