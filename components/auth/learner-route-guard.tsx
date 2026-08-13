"use client";

import { useEffect, useState, type ReactNode } from "react";
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
];

export function LearnerRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useAppStore((state) => state.hasHydrated);
  const [clientReady, setClientReady] = useState(false);
  const protectedRoute = learnerPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const backendUnavailable =
    getBackendMode() !== "supabase" && protectedRoute;
  const ready = hydrated || clientReady;

  useEffect(() => {
    const timer = window.setTimeout(() => setClientReady(true), 50);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!backendUnavailable || !ready) return;
    const query = window.location.search.replace(/^\?/, "");
    const next = `${pathname}${query ? `?${query}` : ""}`;
    router.replace(
      `/login?error=backend-not-configured&next=${encodeURIComponent(next)}`,
    );
  }, [backendUnavailable, pathname, ready, router]);

  if (backendUnavailable) {
    return (
      <main
        className="grid min-h-screen place-items-center bg-paper"
        aria-label="Checking application configuration"
      >
        <span className="size-10 animate-spin rounded-full border-4 border-moss-100 border-t-moss-600" />
      </main>
    );
  }

  return children;
}
