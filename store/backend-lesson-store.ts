"use client";

import { create } from "zustand";
import { getBackendMode } from "@/lib/supabase/config";
import {
  forgetCachedLessons,
  lessonRepository,
} from "@/lib/repositories/lesson-repository";
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
    // A playable payload carries who it was loaded for -- their plan decides
    // whether Listening and Speaking are in it, and their kanji history is
    // baked in. It must not outlive the account that fetched it.
    forgetCachedLessons();
    set({
      ownerUserId: userId,
      lessons: [],
      status: "idle",
      loading: false,
      loaded: false,
      error: "",
    });
  },
  reset: () => {
    forgetCachedLessons();
    set(emptyState);
  },
  // The custom-topic product no longer auto-assigns a published lesson. Keep
  // this legacy store method inert for callers that still revalidate the store;
  // specific created/resumable lessons are loaded through loadOne().
  load: async (userId) => {
    if (getBackendMode() !== "supabase") return;
    if (userId) get().scopeTo(userId);
    if (!get().ownerUserId) return;
    set({
      lessons: [],
      loading: false,
      loaded: true,
      status: "exhausted",
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
