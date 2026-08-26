"use client";

import { create } from "zustand";

export type BackendProgressStatus = "idle" | "loading" | "ready" | "error";

interface BackendProgressState {
  ownerUserId: string | null;
  status: BackendProgressStatus;
  error: string;
  completedLessonCount: number | null;
  begin: (userId: string, blocking?: boolean) => void;
  succeed: (userId: string, completedLessonCount: number) => void;
  fail: (userId: string, error: string, blocking?: boolean) => void;
  reset: () => void;
}

const emptyState = {
  ownerUserId: null,
  status: "idle" as const,
  error: "",
  completedLessonCount: null,
};

/**
 * Non-persisted transport state for backend-derived progress.
 *
 * The main app store only receives snapshots after a successful server load.
 * This store records whether those values are actually trustworthy for the
 * current authenticated account, so UI never has to infer truth from zero-ish
 * defaults or stale values left by another account.
 */
export const useBackendProgressStore = create<BackendProgressState>((set, get) => ({
  ...emptyState,
  begin: (userId, blocking = true) => {
    if (!userId) return;
    const current = get();
    if (current.ownerUserId !== userId) {
      set({
        ownerUserId: userId,
        status: "loading",
        error: "",
        completedLessonCount: null,
      });
      return;
    }

    // Token refreshes and tab-return hydration are deliberately silent once a
    // trusted snapshot exists. Initial hydration and explicit retries block.
    if (!blocking && current.status === "ready") return;
    set({ status: "loading", error: "" });
  },
  succeed: (userId, completedLessonCount) => {
    if (!userId || get().ownerUserId !== userId) return;
    set({
      status: "ready",
      error: "",
      completedLessonCount: Math.max(0, completedLessonCount),
    });
  },
  fail: (userId, error, blocking = true) => {
    if (!userId || get().ownerUserId !== userId) return;

    // A background refresh failure must not invalidate the last successful
    // server snapshot. Initial hydration/retry failures have no trusted data to
    // fall back to and therefore become an explicit error state.
    if (!blocking && get().status === "ready") return;
    set({
      status: "error",
      error: error || "Your progress could not be loaded.",
      completedLessonCount: null,
    });
  },
  reset: () => set(emptyState),
}));
