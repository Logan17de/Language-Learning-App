import type { StateStorage } from "zustand/middleware";
import type { AdminStoreState } from "@/store/admin-store-types";

const memoryStorage = new Map<string, string>();

export const adminSafeStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return memoryStorage.get(name) ?? null;
      return window.localStorage.getItem(name);
    } catch {
      return memoryStorage.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(name, value);
      memoryStorage.set(name, value);
    } catch {
      memoryStorage.set(name, value);
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(name);
    } catch {
      // The in-memory fallback remains available when browser storage is blocked.
    }
    memoryStorage.delete(name);
  },
};

export function migrateAdminStore(persistedState: unknown, version: number): Partial<AdminStoreState> {
  if (!persistedState || typeof persistedState !== "object") return {};
  const saved = persistedState as Partial<AdminStoreState>;
  if (version < 2) {
    return {
      ...saved,
      deletedLessonIds: saved.deletedLessonIds ?? [],
      auditLog: saved.auditLog ?? [],
    };
  }
  return saved;
}
