"use client";

import { create } from "zustand";
import { getBackendMode } from "@/lib/supabase/config";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson } from "@/lib/repositories/lesson-mapper";
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
    if (getBackendMode() !== "supabase" || get().loading || get().loaded) return;
    set({ loading: true, error: "" });
    const result = await lessonRepository.assignNext();
    if (!result.ok) {
      set({ loading: false, loaded: true, error: result.error.message });
      return;
    }
    const lessons = result.data ? [mapCanonicalLesson(result.data.lesson)] : [];
    set({ lessons, loading: false, loaded: true, error: result.data ? "" : "You have completed every available lesson at this level." });
  },
  loadOne: async (id) => {
    const existing = get().lessons.find((lesson) => lesson.id === id);
    if (existing) return existing;
    const result = await lessonRepository.assignNext();
    if (!result.ok || !result.data) return undefined;
    const lesson = mapCanonicalLesson(result.data.lesson);
    if (lesson.id !== id && result.data.assignment.lessonId !== id) return undefined;
    set((state) => ({ lessons: [...state.lessons.filter((item) => item.id !== lesson.id), lesson] }));
    return lesson;
  },
}));
