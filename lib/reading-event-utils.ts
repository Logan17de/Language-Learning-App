import type { ReadingEvent, ReadingEventType } from "@/types/lesson-session";

export function createReadingEvent(
  type: ReadingEventType,
  term: string,
  elapsedSeconds: number,
  occurrence = 0,
): ReadingEvent {
  const confidence =
    type === "correct-word" || type === "successful-retry"
      ? "high"
      : type === "stopped-at-word" && occurrence === 0
        ? "low"
        : "medium";
  return {
    id: `${type}_${term}_${elapsedSeconds}_${occurrence}`,
    type,
    term,
    confidence,
    elapsedSeconds,
  };
}

export function createStopEvent(
  expectedTerms: string[],
  highlightedIndex: number,
  elapsedSeconds: number,
  priorEvents: ReadingEvent[],
): ReadingEvent | null {
  const nextExpected = expectedTerms[Math.min(highlightedIndex, expectedTerms.length - 1)];
  if (!nextExpected) return null;
  const priorCount = priorEvents.filter((event) => event.term === nextExpected && event.type === "stopped-at-word").length;
  return createReadingEvent("stopped-at-word", nextExpected, elapsedSeconds, priorCount);
}
