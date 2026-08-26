"use client";

/**
 * Which lesson a browser is still allowed to be in.
 *
 * A learner holds one open lesson. When they start another one — in a second
 * browser, a second profile, a phone — the first is closed and drops off their
 * path. The browser still sitting on it has no way to know that on its own: it
 * keeps a full local copy of the session, so it looks fine, and every section
 * it tries to save is refused for a reason it cannot act on. It used to answer
 * that by retrying, which reopened the old lesson and closed the new one, and
 * the two browsers traded the open slot between them.
 *
 * So the refusal is now a fact the whole page can see. The sync path raises it
 * once, the player stops the lesson and says what happened, and nothing tries
 * to take the slot back.
 */

/** The server's own words, so a plain message is recognised wherever it lands. */
const SUPERSEDED_MESSAGES = [
  "This lesson was set aside when another lesson was opened",
  "A newer lesson owns this checkpoint",
  "You have a newer lesson open, so this one was set aside",
] as const;

export class LessonSupersededError extends Error {
  readonly lessonId: string;

  constructor(lessonId: string) {
    super("You have a newer lesson open, so this one was set aside.");
    this.name = "LessonSupersededError";
    this.lessonId = lessonId;
  }
}

export function isLessonSupersededError(
  value: unknown,
): boolean {
  if (value instanceof LessonSupersededError) return true;
  return value instanceof Error && describesSupersededLesson(value.message);
}

/**
 * True for the database's refusal to reopen a lesson that was set aside. The
 * message arrives as plain text through PostgREST, so this is the seam.
 */
export function describesSupersededLesson(message: string): boolean {
  return SUPERSEDED_MESSAGES.some((candidate) => message.includes(candidate));
}

export const lessonSupersededEvent = "aiko-lesson-superseded";
export const activeLessonChangedEvent = "aiko-active-lesson-changed";
export const activeLessonStorageKey = "aiko-active-lesson-v1";

const supersededLessons = new Set<string>();

/**
 * Announce that this lesson is over for this browser. Announced once: the
 * player listens for it, and repeating it would restart an exit already in
 * progress.
 */
export function markLessonSuperseded(lessonId: string): void {
  const id = lessonId.trim();
  if (!id || supersededLessons.has(id)) return;
  supersededLessons.add(id);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(lessonSupersededEvent, { detail: id }),
  );
}

/** For a player that mounts after the announcement has already gone out. */
export function lessonWasSuperseded(lessonId: string): boolean {
  return supersededLessons.has(lessonId.trim());
}

/**
 * Tell every tab on this device which lesson just acquired the server slot.
 *
 * The custom event covers a route change in this tab. Updating localStorage
 * produces a native `storage` event in the other tabs. This is only an early
 * UX signal; the database remains the authority for another browser/device.
 */
export function announceActiveLesson(lessonId: string): void {
  const id = lessonId.trim();
  if (!id || typeof window === "undefined") return;
  const announcement = JSON.stringify({ lessonId: id, nonce: crypto.randomUUID() });
  window.dispatchEvent(
    new CustomEvent(activeLessonChangedEvent, { detail: id }),
  );
  try {
    window.localStorage.setItem(activeLessonStorageKey, announcement);
  } catch {
    // Storage can be disabled. The server refusal still closes the old lesson.
  }
}

export function activeLessonFromStorage(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "lessonId" in parsed &&
      typeof parsed.lessonId === "string"
    ) {
      return parsed.lessonId.trim() || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Test seam. Nothing in the product forgets a lesson it has been shut out of. */
export function forgetSupersededLessons(): void {
  supersededLessons.clear();
}
