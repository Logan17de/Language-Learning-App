"use client";

import { create } from "zustand";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson } from "@/lib/repositories/lesson-mapper-v3";
import type { LessonPackage } from "@/types/lesson";

export type BackendLessonStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "exhausted";

interface BackendLessonState {
  ownerUserId: string | null;
  lessons: LessonPackage[];
  status: BackendLessonStatus;
  loading: boolean;
  loaded: boolean;
  error: string;
  scopeTo: (userId: string) => void;
  reset: () => void;
  load: (userId?: string) => Promise<void>;
  loadOne: (id: string) => Promise<LessonPackage | undefined>;
}

const emptyState = {
  ownerUserId: null,
  lessons: [] as LessonPackage[],
  status: "idle" as const,
  loading: false,
  loaded: false,
  error: "",
};

export const useBackendLessonStore = create<BackendLessonState>((set, get) => ({
  ...emptyState,
  scopeTo: (userId) => {
    if (!userId) return;
    const current = get();
    if (current.ownerUserId === userId) return;
    set({
      ownerUserId: userId,
      lessons: [],
      status: "idle",
      loading: false,
      loaded: false,
      error: "",
    });
  },
  reset: () => set(emptyState),
  load: async (userId) => {
    if (getBackendMode() !== "supabase") return;
    if (userId) get().scopeTo(userId);

    const current = get();
    const ownerUserId = current.ownerUserId;
    if (!ownerUserId || current.loading) return;

    // First visit and explicit retry for this account need a visible loading
    // state. Once this same account already owns a valid assignment in memory,
    // revalidate it silently so tab/session refreshes stay visually static.
    const blocking =
      current.status === "idle" ||
      current.status === "error" ||
      (!current.loaded && current.lessons.length === 0);
    if (blocking) {
      set({ loading: true, status: "loading", error: "" });
    } else if (current.error) {
      set({ error: "" });
    }

    const result = await lessonRepository.assignNext();

    // Never let a slow response from account A write into the store after the
    // auth scope has already moved to account B or signed out.
    if (get().ownerUserId !== ownerUserId) return;

    if (!result.ok) {
      const hasTrustedLesson = !blocking && get().lessons.length > 0;
      set((state) => ({
        lessons: hasTrustedLesson ? state.lessons : [],
        loading: false,
        loaded: true,
        status: hasTrustedLesson ? "ready" : "error",
        error: result.error.message,
      }));
      return;
    }

    if (!result.data) {
      set({
        lessons: [],
        loading: false,
        loaded: true,
        status: "exhausted",
        error: "",
      });
      return;
    }

    set({
      lessons: [mapCanonicalLesson(result.data.lesson)],
      loading: false,
      loaded: true,
      status: "ready",
      error: "",
    });
  },
  loadOne: async (id) => {
    const ownerUserId = get().ownerUserId;
    if (!ownerUserId) return undefined;

    const existing = get().lessons.find((lesson) => lesson.id === id);
    if (existing) return existing;

    const result = await lessonRepository.getPlayable(id);
    if (!result.ok || get().ownerUserId !== ownerUserId) return undefined;

    const lesson = mapCanonicalLesson(result.data);
    set((state) => ({
      lessons: [
        ...state.lessons.filter((item) => item.id !== lesson.id),
        lesson,
      ],
    }));
    return lesson;
  },
}));
