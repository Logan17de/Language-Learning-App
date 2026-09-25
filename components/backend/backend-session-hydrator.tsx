"use client";

import { useEffect, useState } from "react";
import {
  clearClientAccountState,
  hydrateClientSession,
} from "@/lib/auth/client-session";
import { authService } from "@/lib/auth/auth-service";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";

export function BackendSessionHydrator() {
  const backendMode = getBackendMode();
  const setBackendSessionChecked = useAppStore(
    (state) => state.setBackendSessionChecked,
  );
  const [loading, setLoading] = useState(backendMode === "supabase");

  useEffect(() => {
    if (backendMode !== "supabase") {
      setBackendSessionChecked(true);
      return;
    }

    let active = true;

    async function restoreSession() {
      if (active) setLoading(true);
      try {
        await hydrateClientSession(true);
      } catch (error) {
        console.error("Backend session hydration failed.", error);
      } finally {
        if (active) {
          // A thrown network/client error must never leave public auth screens
          // trapped behind an account-status spinner.
          setBackendSessionChecked(true);
          setLoading(false);
        }
      }
    }

    void restoreSession();
    const unsubscribe = authService.subscribe((signedIn) => {
      if (signedIn) return;
      clearClientAccountState();
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [backendMode, setBackendSessionChecked]);

  if (!loading) return null;
  return (
    <div
      className="fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-moss-100"
      aria-label="Restoring account session"
    >
      <span className="block h-full w-1/2 animate-pulse bg-moss-600" />
    </div>
  );
}
