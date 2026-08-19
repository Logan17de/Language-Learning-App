"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import { hydrateClientSession } from "@/lib/auth/client-session";

export function BackendSessionHydrator() {
  const pathname = usePathname() ?? "";
  const backendMode = getBackendMode();
  const resetAccountState = useAppStore((state) => state.resetDemo);
  const shouldHydrate = backendMode === "supabase" && !pathname.startsWith("/admin");
  const [loading, setLoading] = useState(shouldHydrate);

  useEffect(() => {
    if (!shouldHydrate) {
      setLoading(false);
      return;
    }

    let active = true;
    async function hydrate() {
      await hydrateClientSession();
      if (active) setLoading(false);
    }

    setLoading(true);
    void hydrate();
    const unsubscribe = authService.subscribe((signedIn) => {
      if (!signedIn) resetAccountState();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [resetAccountState, shouldHydrate]);

  if (!shouldHydrate || !loading) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-moss-100"
      aria-label="Restoring account session"
    >
      <span className="block h-full w-1/2 animate-pulse bg-moss-600" />
    </div>
  );
}
