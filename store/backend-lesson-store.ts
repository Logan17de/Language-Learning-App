"use client";

import { create } from "zustand";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson } from "@/lib/repositories/lesson-mapper-v3";
import type { LessonPackage } from "@/types/lesson";

interface BackendLessonState {
  lessons: LessonPackage[];
  loading: boolean;
  loaded: boolean;
  error: string;
  load: () => Promise<void>;
  loadOne: (id: string) => Promise<LessonPackage | undefined>;
}

export const useBackendLessonStore = create<BackendLessonState>((set, get) => ({
  lessons: [],
  loading: false,
  loaded: false,
  error: "",
  load: async () => {
    if (getBackendMode() !== "supabase" || get().loading) return;

    // First visit may need a visible loading state. Once a learner already has
    // assignment data in memory, revalidate it silently. This keeps Learn/Home
    // visually static when their components remount or the auth session refreshes.
    const current = get();
    const blocking = !current.loaded && current.lessons.length === 0;
    if (blocking) set({ loading: true, error: "" });
    else if (current.error) set({ error: "" });

    const result = await lessonRepository.assignNext();
    if (!result.ok) {
      set((state) => ({
        lessons: blocking ? [] : state.lessons,
        loading: false,
        loaded: true,
        error: result.error.message,
      }));
      return;
    }

    const lessons = result.data
      ? [mapCanonicalLesson(result.data.lesson)]
      : [];
    set({
      lessons,
      loading: false,
      loaded: true,
      error: result.data
        ? ""
        : "You have completed every available lesson at this level.",
    });
  },
  loadOne: async (id) => {
    const existing = get().lessons.find((lesson) => lesson.id === id);
    if (existing) return existing;
    const result = await lessonRepository.getPlayable(id);
    if (!result.ok) return undefined;
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
