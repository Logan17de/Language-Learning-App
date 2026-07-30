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

export type EnrichedStoryDraft = StoryDraft;
