"use client";

import { create } from "zustand";
import { adminLessonRepository } from "@/lib/repositories/admin-lesson-repository";
import { lessonRepository } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson } from "@/lib/repositories/lesson-mapper";
import type { LessonPackage, LessonStatus } from "@/types/lesson";

interface BackendAdminLessonState {
  lessons: LessonPackage[];
  backendIds: Record<string, string>;
  loading: boolean;
  error: string;
  load: (force?: boolean) => Promise<void>;
  setStatus: (lesson: LessonPackage, status: LessonStatus) => Promise<boolean>;
}

export const useBackendAdminLessonStore = create<BackendAdminLessonState>((set, get) => ({
  lessons: [],
  backendIds: {},
  loading: false,
  error: "",
  load: async (force = false) => {
    if (get().loading || (!force && get().lessons.length)) return;
    set({ loading: true, error: "" });
    const [result, versions] = await Promise.all([
      adminLessonRepository.list(),
      adminLessonRepository.listVersions(),
    ]);
    if (!result.ok) {
      set({ loading: false, error: result.error.message });
      return;
    }
    if (!versions.ok) {
      set({ loading: false, error: versions.error.message });
      return;
    }
    const loaded = await Promise.all(result.data.flatMap((lesson) => {
      const draft = versions.data.find((version) => version.lesson_id === lesson.id && version.status === "draft");
      const versionId = draft?.id ?? lesson.current_version_id;
      return versionId ? [lessonRepository.getVersionForSession(lesson.id, versionId)] : [];
    }));
    const lessons = loaded.flatMap((item) => item.ok ? [mapCanonicalLesson(item.data)] : []);
    const backendIds = Object.fromEntries(result.data.map((lesson) => [lesson.legacy_id ?? lesson.id, lesson.id]));
    set({ lessons, backendIds, loading: false, error: loaded.some((item) => !item.ok) ? "Some lesson versions could not be loaded." : "" });
  },
  setStatus: async (lesson, status) => {
    const backendId = get().backendIds[lesson.id];
    if (!backendId) return false;
    const result = status === "published"
      ? await adminLessonRepository.publish(backendId, "Published from the AIko admin workspace")
      : await adminLessonRepository.update(backendId, {
        status: status === "malformed" ? "needs_review" : status,
        archived_at: status === "archived" ? new Date().toISOString() : null,
        published_at: status === "draft" ? null : undefined,
      });
    if (!result.ok) {
      set({ error: result.error.message });
      return false;
    }
    set({ lessons: [] });
    await get().load(true);
    return true;
  },
}));
