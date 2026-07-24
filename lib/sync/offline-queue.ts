"use client";

import type { Json } from "@/types/database";

export type SyncOperationKind = "lesson_checkpoint" | "lesson_completion" | "review_checkpoint" | "review_completion";

export interface SyncOperation {
  id: string;
  dedupeKey: string;
  kind: SyncOperationKind;
  payload: Json;
  attempts: number;
  queuedAt: string;
  lastError?: string;
}

const storageKey = "aiko-pending-sync-v1";
const eventName = "aiko-sync-status";

export function readSyncQueue(): SyncOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is SyncOperation =>
      typeof item === "object" && item !== null && "id" in item && "kind" in item && "payload" in item
    ) : [];
  } catch {
    return [];
  }
}

function write(items: SyncOperation[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(items.slice(-100)));
  window.dispatchEvent(new CustomEvent(eventName, { detail: items.length }));
}

export function enqueueSync(kind: SyncOperationKind, dedupeKey: string, payload: Json, error?: string): void {
  const current = readSyncQueue().filter((item) => item.dedupeKey !== dedupeKey);
  write([...current, {
    id: crypto.randomUUID(),
    dedupeKey,
    kind,
    payload,
    attempts: 0,
    queuedAt: new Date().toISOString(),
    lastError: error,
  }]);
}

export function removeSyncOperation(id: string): void {
  write(readSyncQueue().filter((item) => item.id !== id));
}

export function markSyncAttempt(id: string, error: string): void {
  write(readSyncQueue().map((item) => item.id === id ? { ...item, attempts: item.attempts + 1, lastError: error } : item));
}

export const syncStatusEvent = eventName;
