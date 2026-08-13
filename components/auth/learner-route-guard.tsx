"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

const learnerPrefixes = [
  "/home",
  "/learn",
  "/progress",
  "/custom-topic",
  "/profile",
  "/settings",
  "/subscription",
  "/lesson",
  "/onboarding",
];

export function LearnerRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hasHydrated);
  const backendSessionChecked = useAppStore(
    (state) => state.backendSessionChecked,
  );
  const authenticated = useAppStore((state) => state.isAuthenticated);
  const protectedRoute = learnerPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const backendReady = getBackendMode() === "supabase";
  const blockedByConfig = protectedRoute && !backendReady;
  const checkingSession =
    protectedRoute && backendReady && (!hydrated || !backendSessionChecked);
  const signedOut =
    protectedRoute && backendReady && hydrated && backendSessionChecked && !authenticated;

  useEffect(() => {
    if (!blockedByConfig && !signedOut) return;
    const query = window.location.search.replace(/^\?/, "");
    const next = `${pathname}${query ? `?${query}` : ""}`;
    const error = blockedByConfig ? "&error=backend-not-configured" : "";
    router.replace(`/login?next=${encodeURIComponent(next)}${error}`);
  }, [blockedByConfig, pathname, router, signedOut]);

  if (blockedByConfig || checkingSession || signedOut) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-paper"
        aria-label="Checking account session"
      >
        <span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" />
      </main>
    );
  }

  return children;
}
