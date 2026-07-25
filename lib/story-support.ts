import type { JLPTLevel } from "@/types/lesson";
import type { StoryInteraction } from "@/types/lesson-session";

export const STORY_READING_PENALTY = 15;
export const STORY_MEANING_PENALTY = 25;

export interface StorySegment {
  text: string;
  term?: string;
}

export interface StoryLengthRange {
  min: number;
  max: number;
}

export function storyLengthRange(level: JLPTLevel): StoryLengthRange {
  const ranges: Record<JLPTLevel, StoryLengthRange> = {
    N5: { min: 10, max: 12 },
    N4: { min: 12, max: 14 },
    N3: { min: 14, max: 16 },
    N2: { min: 16, max: 18 },
    N1: { min: 18, max: 20 },
  };
  return ranges[level];
}

export function isKanaOnly(term: string): boolean {
  return /^[\u3040-\u309f\u30a0-\u30ffー]+$/u.test(term);
}

export function segmentStoryLine(
  japanese: string,
  tappableTerms: string[],
): StorySegment[] {
  const terms = Array.from(
    new Set(tappableTerms.filter((term) => term && japanese.includes(term))),
  ).sort((left, right) => right.length - left.length);
  if (!terms.length) return [{ text: japanese }];

  const termSet = new Set(terms);
  const pattern = new RegExp(
    `(${terms.map(escapeRegExp).join("|")})`,
    "gu",
  );
  return japanese
    .split(pattern)
    .filter(Boolean)
    .map((text) => ({ text, term: termSet.has(text) ? text : undefined }));
}

export function storyTermScore(
  interactions: StoryInteraction[],
  lineId: string,
  term: string,
): number {
  const evidence = interactions.filter(
    (item) => item.lineId === lineId && item.term === term,
  );
  const readingUsed = evidence.some(
    (item) => item.type === "reading-revealed",
  );
  const meaningUsed = evidence.some(
    (item) => item.type === "meaning-revealed",
  );
  return Math.max(
    0,
    100 -
      (readingUsed ? STORY_READING_PENALTY : 0) -
      (meaningUsed ? STORY_MEANING_PENALTY : 0),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}
