"use client";

import { useEffect, useState } from "react";
import { Brand } from "@/components/ui/brand";
import { ButtonLink } from "@/components/ui/button";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

const navigationLinkClass =
  "rounded-md outline-none transition hover:text-ink focus-visible:ring-4 focus-visible:ring-moss-200 focus-visible:ring-offset-2";

export function PublicHeader() {
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const backendMode = getBackendMode();
  const [backendSignedIn, setBackendSignedIn] = useState<boolean | null>(null);

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

  const showDashboard =
    backendMode === "supabase"
      ? backendSignedIn === true
      : hasHydrated && isAuthenticated;

  return (
    <header className="sticky top-0 z-40 border-b border-black/[0.05] bg-paper/90 backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Brand />
        <nav
          className="hidden items-center gap-8 text-sm font-medium text-stone-600 md:flex"
          aria-label="Primary navigation"
        >
          <a className={navigationLinkClass} href="#learning-system">Method</a>
          <a className={navigationLinkClass} href="#lesson-journey">Lesson journey</a>
          <a className={navigationLinkClass} href="#pricing">Pricing</a>
          <a className={navigationLinkClass} href="#founder">Our story</a>
        </nav>
        <div className="flex items-center gap-2">
          {showDashboard ? (
            <ButtonLink href="/home" className="min-h-10 px-5">
              Go to dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" variant="ghost" className="hidden sm:inline-flex">
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" className="min-h-10 px-5">
                Start learning
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
