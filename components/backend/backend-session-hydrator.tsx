"use client";

import { useEffect, useState } from "react";
import { getBackendMode } from "@/lib/supabase/config";
import { useAppStore } from "@/store/app-store";
import { authService } from "@/lib/auth/auth-service";
import { prepareAccountScope } from "@/lib/auth/account-scope";
import { progressRepository } from "@/lib/repositories/progress-repository";
import { settingsRepository } from "@/lib/repositories/settings-repository";

export function BackendSessionHydrator() {
  const backendMode = getBackendMode();
  const syncBackendIdentity = useAppStore((state) => state.syncBackendIdentity);
  const signOut = useAppStore((state) => state.signOut);
  const setSubscription = useAppStore((state) => state.setSubscription);
  const hydrateBackendProgress = useAppStore(
    (state) => state.hydrateBackendProgress,
  );
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

    async function hydrate(blocking: boolean) {
      // Only the first account restore is allowed to block protected routes.
      // Supabase also emits auth events for token/session refreshes (commonly
      // when a browser tab becomes active again). Those refreshes must happen
      // silently so the learner page stays mounted and visually unchanged.
      if (blocking) {
        setBackendSessionChecked(false);
        if (active) setLoading(true);
      }

      const result = await authService.getIdentity();
      if (!result.ok) {
        // A transient background refresh failure should not tear down a page
        // that already has a valid learner session. The next auth event can
        // retry it. Initial restoration remains strict.
        if (blocking) {
          signOut();
          if (active) setLoading(false);
        }
        return;
      }
      if (!result.data) {
        signOut();
        if (active) setLoading(false);
        return;
      }

      prepareAccountScope(result.data.id, signOut);
      syncBackendIdentity(
        result.data.id,
        result.data.displayName,
        result.data.email,
        result.data.onboardingComplete,
      );
      setSubscription(
        result.data.subscriptionPlan === "free" ? "free" : "premium",
        result.data.subscriptionPlan === "premium_annual" ? "annual" : "monthly",
      );

      const [progress, settings] = await Promise.all([
        progressRepository.loadCurrent(),
        settingsRepository.loadCurrent(),
      ]);
      if (progress.ok) hydrateBackendProgress(progress.data);
      if (settings.ok) {
        // Server-backed settings replace any stale device-local settings without
        // writing them straight back to Supabase during hydration.
        useAppStore.setState({ settings: settings.data });
      }
      setBackendSessionChecked(true);
      if (blocking && active) setLoading(false);
    }

    void hydrate(true);
    const unsubscribe = authService.subscribe((signedIn) => {
      if (!signedIn) {
        signOut();
        if (active) setLoading(false);
        return;
      }
      void hydrate(false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [
    backendMode,
    hydrateBackendProgress,
    setBackendSessionChecked,
    setSubscription,
    signOut,
    syncBackendIdentity,
  ]);

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
