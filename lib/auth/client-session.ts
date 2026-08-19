"use client";

import { authService, type AuthIdentity } from "@/lib/auth/auth-service";
import { progressRepository } from "@/lib/repositories/progress-repository";
import type { RepositoryResult } from "@/lib/repositories/result";
import { useAppStore } from "@/store/app-store";

let hydrationInFlight: Promise<RepositoryResult<AuthIdentity | null>> | null = null;

export async function applyClientIdentity(identity: AuthIdentity): Promise<void> {
  const state = useAppStore.getState();
  state.syncBackendIdentity(identity.displayName, identity.email);
  useAppStore.setState((current) => ({
    onboarding: {
      ...current.onboarding,
      completed: identity.onboardingComplete,
    },
  }));
  state.setSubscription(
    identity.subscriptionPlan === "free" ? "free" : "premium",
    identity.subscriptionPlan === "premium_annual" ? "annual" : "monthly",
  );

  const progress = await progressRepository.loadCurrent();
  if (progress.ok) {
    useAppStore.getState().hydrateBackendProgress(progress.data);
  }
}

export async function hydrateClientSession(): Promise<
  RepositoryResult<AuthIdentity | null>
> {
  if (hydrationInFlight) return hydrationInFlight;

  const promise = (async () => {
    const identity = await authService.getIdentity();
    if (!identity.ok || !identity.data) {
      useAppStore.getState().resetDemo();
      return identity;
    }

    await applyClientIdentity(identity.data);
    return identity;
  })();

  hydrationInFlight = promise;
  try {
    return await promise;
  } finally {
    if (hydrationInFlight === promise) hydrationInFlight = null;
  }
}
