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
    const list = await lessonRepository.listPublished();
    if (!list.ok) {
      set({ loading: false, loaded: true, error: list.error.message });
      return;
    }
    const results = await Promise.all(list.data.map((lesson) => lessonRepository.getPublished(lesson.id)));
    const lessons = results.flatMap((result) => result.ok ? [mapCanonicalLesson(result.data)] : []);
    set({ lessons, loading: false, loaded: true, error: results.some((result) => !result.ok) ? "Some lessons could not be loaded." : "" });
  },
  loadOne: async (id) => {
    const existing = get().lessons.find((lesson) => lesson.id === id);
    if (existing) return existing;
    const result = await lessonRepository.getPlayable(id);
    if (!result.ok) return undefined;
    const lesson = mapCanonicalLesson(result.data);
    set((state) => ({ lessons: [...state.lessons.filter((item) => item.id !== lesson.id), lesson] }));
    return lesson;
  },
}));
