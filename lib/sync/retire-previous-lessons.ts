"use client";

import { discardSyncOperationsForOtherLessons } from "@/lib/sync/offline-queue";
import { useAppStore } from "@/store/app-store";

/**
 * Retire every lesson except the one just created.
 *
 * Creating a lesson abandons the one before it, and the leftovers are not
 * harmless. A queued phase commit is validated server-side against that
 * session's checkpoint, and an abandoned session has had its incomplete phase
 * reset — so the commit is refused with "Story phase is incomplete" on every
 * retry, forever. The learner is then shown a save warning, with a Retry button
 * that cannot succeed, about a lesson they have already moved on from.
 *
 * Dropping the queued work is safe precisely because it can never be accepted.
 * The local session goes with it, since a checkpoint for a superseded lesson is
 * not something the learner can return to.
 */
export function retirePreviousLessons(currentLessonId: string): void {
  const lessonId = currentLessonId.trim();
  if (!lessonId) return;
  discardSyncOperationsForOtherLessons(lessonId);
  useAppStore.getState().keepOnlyLessonSession(lessonId);
}
