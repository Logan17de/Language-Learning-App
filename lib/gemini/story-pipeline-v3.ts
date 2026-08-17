import type {
  LessonPlan,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";

export interface LessonPlanV3 extends LessonPlan {
  /** Optional onboarding interests. Empty means the story prompt ignores interests. */
  interests: string[];
}

export interface StoryOnlyDraftLine {
  japanese: string;
  english: string;
}

/**
 * Output of API call 1. It deliberately contains no lexical analysis,
 * readings, meanings, questions, or activity data.
 */
export interface StoryOnlyDraft {
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  lines: StoryOnlyDraftLine[];
}

export interface StoryPassageOutput {
  selected_interest: string;
  japanese_title: string;
  english_title: string;
  japanese_story: string;
  english_translation: string;
}

function firstSentence(value: string): string {
  const trimmed = value.trim();
  const end = trimmed.search(/[。！？.!?]/u);
  return end >= 0 ? trimmed.slice(0, end + 1) : trimmed;
}

/**
 * Keep one canonical passage inside the existing line-based lesson contract.
 * Older multi-line lessons remain valid while new stories render as one
 * naturally wrapping paragraph in every reader.
 */
export function normalizeStoryPassage(
  value: StoryPassageOutput,
): StoryOnlyDraft {
  return {
    title: value.english_title.trim(),
    japaneseTitle: value.japanese_title.trim(),
    summary: firstSentence(value.english_translation),
    storyPreview: firstSentence(value.japanese_story),
    tags: [value.selected_interest.trim()].filter(Boolean),
    lines: [{
      japanese: value.japanese_story.trim(),
      english: value.english_translation.trim(),
    }],
  };
}

export type EnrichedStoryDraft = StoryDraft;