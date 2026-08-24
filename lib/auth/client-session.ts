"use client";

import { prepareAccountScope } from "@/lib/auth/account-scope";
import { authService, type AuthIdentity } from "@/lib/auth/auth-service";
import { progressRepository } from "@/lib/repositories/progress-repository";
import type { RepositoryResult } from "@/lib/repositories/result";
import { settingsRepository } from "@/lib/repositories/settings-repository";
import { useAppStore } from "@/store/app-store";
import { useBackendLessonStore } from "@/store/backend-lesson-store";
import { useBackendProgressStore } from "@/store/backend-progress-store";

let hydrationInFlight: Promise<RepositoryResult<AuthIdentity | null>> | null = null;

export function clearClientAccountState(): void {
  useAppStore.getState().signOut();
  useBackendLessonStore.getState().reset();
  useBackendProgressStore.getState().reset();
}

export async function applyClientIdentity(
  identity: AuthIdentity,
  blocking = true,
): Promise<void> {
  const userId = identity.id;
  prepareAccountScope(userId, clearClientAccountState);
  useBackendLessonStore.getState().scopeTo(userId);
  useBackendProgressStore.getState().begin(userId, blocking);

  const state = useAppStore.getState();
  state.syncBackendIdentity(
    userId,
    identity.displayName,
    identity.email,
    identity.onboardingComplete,
  );
  state.setSubscription(
    identity.subscriptionPlan === "free" ? "free" : "premium",
    identity.subscriptionPlan === "premium_annual" ? "annual" : "monthly",
    {
      status: identity.subscriptionStatus,
      renewsAt: identity.subscriptionRenewsAt ?? undefined,
      billingProvider: identity.billingProvider,
      cancelAtPeriodEnd: identity.cancelAtPeriodEnd,
    },
  );

  const [progress, settings] = await Promise.all([
    progressRepository.loadCurrent(),
    settingsRepository.loadCurrent(),
  ]);

  const accountStillCurrent =
    useBackendProgressStore.getState().ownerUserId === userId &&
    useAppStore.getState().user.id === userId;

  if (progress.ok) {
    if (accountStillCurrent) {
      useAppStore.getState().hydrateBackendProgress(progress.data);
      useBackendProgressStore
        .getState()
        .succeed(userId, progress.data.completedLessonCount);
    }
  } else {
    useBackendProgressStore
      .getState()
      .fail(userId, progress.error.message, blocking);
  }

  if (settings.ok && accountStillCurrent) {
    useAppStore.setState({ settings: settings.data });
  }

  if (accountStillCurrent) {
    useAppStore.getState().setBackendSessionChecked(true);
  }
}

export async function hydrateClientSession(
  blocking = true,
): Promise<RepositoryResult<AuthIdentity | null>> {
  if (hydrationInFlight) return hydrationInFlight;

  if (blocking) {
    useAppStore.getState().setBackendSessionChecked(false);
  }

  const promise = (async () => {
    const identity = await authService.getIdentity();
    if (!identity.ok) {
      if (blocking) clearClientAccountState();
      return identity;
    }
    if (!identity.data) {
      clearClientAccountState();
      return identity;
    }

    await applyClientIdentity(identity.data, blocking);
    return identity;
  })();

  hydrationInFlight = promise;
  try {
    return await promise;
  } finally {
    if (hydrationInFlight === promise) hydrationInFlight = null;
  }
}
