"use client";

import { create } from "zustand";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson } from "@/lib/repositories/lesson-mapper-v3";
import type { LessonPackage } from "@/types/lesson";

interface BackendLessonState {
  lessons: LessonPackage[];
  loading: boolean;
  assigning: boolean;
  loaded: boolean;
  error: string;
  load: () => Promise<void>;
  assignNew: (excludedLessonId: string) => Promise<LessonPackage | undefined>;
  loadOne: (id: string) => Promise<LessonPackage | undefined>;
  reset: () => void;
}

const emptyState = {
  lessons: [] as LessonPackage[],
  loading: false,
  assigning: false,
  loaded: false,
  error: "",
};

export const useBackendLessonStore = create<BackendLessonState>((set, get) => ({
  ...emptyState,
  load: async () => {
    if (getBackendMode() !== "supabase" || get().loading || get().loaded) return;
    set({ loading: true, error: "" });
    const result = await lessonRepository.assignNext();
    if (!result.ok) {
      set({ loading: false, loaded: true, error: result.error.message });
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
  assignNew: async (excludedLessonId) => {
    if (getBackendMode() !== "supabase" || get().assigning) return undefined;
    set({ assigning: true, error: "" });
    const result = await lessonRepository.assignNext();
    if (!result.ok || !result.data) {
      set({
        assigning: false,
        error: result.ok
          ? "No other lesson is ready at this level yet."
          : result.error.message,
      });
      return undefined;
    }
    const lesson = mapCanonicalLesson(result.data.lesson);
    if (lesson.id === excludedLessonId) {
      set({
        assigning: false,
        error:
          "No other lesson is ready at this level yet. Your paused lesson is still safe.",
      });
      return undefined;
    }
    set((state) => ({
      lessons: [
        ...state.lessons.filter((item) => item.id !== lesson.id),
        lesson,
      ],
      assigning: false,
      error: "",
    }));
    return lesson;
  },
  loadOne: async (id) => {
    const existing = get().lessons.find((lesson) => lesson.id === id);
    if (existing) return existing;
    const result = await lessonRepository.assignNext();
    if (!result.ok || !result.data) return undefined;
    const lesson = mapCanonicalLesson(result.data.lesson);
    if (lesson.id !== id && result.data.assignment.lessonId !== id) {
      return undefined;
    }
    set((state) => ({
      lessons: [
        ...state.lessons.filter((item) => item.id !== lesson.id),
        lesson,
      ],
    }));
    return lesson;
  },
  reset: () => set({ ...emptyState }),
}));
