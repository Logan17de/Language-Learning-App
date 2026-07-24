"use client";

import { useEffect, useState } from "react";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import { progressRepository } from "@/lib/repositories/progress-repository";

export function BackendSessionHydrator() {
  const syncBackendIdentity = useAppStore((state) => state.syncBackendIdentity);
  const signOut = useAppStore((state) => state.signOut);
  const setSubscription = useAppStore((state) => state.setSubscription);
  const hydrateBackendProgress = useAppStore((state) => state.hydrateBackendProgress);
  const [loading, setLoading] = useState(getBackendMode() === "supabase");

  useEffect(() => {
    let active = true;
    async function hydrate() {
      const result = await authService.getIdentity();
      if (!result.ok || !result.data) {
        signOut();
        if (active) setLoading(false);
        return;
      }
      syncBackendIdentity(result.data.displayName, result.data.email);
      setSubscription(
        result.data.subscriptionPlan === "free" ? "free" : "premium",
        result.data.subscriptionPlan === "premium_annual" ? "annual" : "monthly",
      );
      const progress = await progressRepository.loadCurrent();
      if (progress.ok) hydrateBackendProgress(progress.data);
      if (active) setLoading(false);
    }
    void hydrate();
    const unsubscribe = authService.subscribe((signedIn) => {
      if (!signedIn) signOut();
      else void hydrate();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [hydrateBackendProgress, setSubscription, signOut, syncBackendIdentity]);

  if (!loading) return null;
  return <div className="fixed inset-x-0 top-0 z-[120] h-1 overflow-hidden bg-moss-100" aria-label="Restoring account session"><span className="block h-full w-1/2 animate-pulse bg-moss-600" /></div>;
}
