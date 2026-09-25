"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { usePublicAuthState } from "@/components/auth/public-auth-provider";

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
  signedOutHref = "/signup",
  signedInLabel = "Continue learning",
  signedInHref = "/home",
  hideWhenSignedIn = false,
  showAiIcon = false,
  className,
  variant = "primary",
}: {
  signedOutLabel: string;
  signedOutHref?: string;
  signedInLabel?: string;
  signedInHref?: string;
  hideWhenSignedIn?: boolean;
  showAiIcon?: boolean;
  className?: string;
  variant?: "primary" | "secondary" | "ghost" | "dark";
}) {
  const { signedIn } = usePublicAuthState();

  if (signedIn && hideWhenSignedIn) return null;

  return (
    <ButtonLink
      href={signedIn ? signedInHref : signedOutHref}
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
