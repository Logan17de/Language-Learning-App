import type { ReviewQueueItem } from "@/types/progress";

export type ReviewActivityType =
  | "kanji-reading"
  | "reading-meaning"
  | "meaning-japanese"
  | "grammar-mcq"
  | "grammar-production"
  | "listening"
  | "speaking"
  | "mistake-correction";

export interface ReviewActivity {
  id: string;
  queueItemId: string;
  type: ReviewActivityType;
  prompt: string;
  cue?: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface ReviewActivityAnswer {
  activityId: string;
  queueItemId: string;
  selectedAnswer: string;
  correct: boolean;
}

export interface QuickReviewResult {
  score: number;
  correctCount: number;
  totalCount: number;
  improvedItemIds: string[];
  weakItemIds: string[];
  xpEarned: number;
  completedAt: string;
}

export interface ReviewSession {
  id: string;
  activities: ReviewActivity[];
  currentIndex: number;
  answers: ReviewActivityAnswer[];
  startedAt: string;
  result: QuickReviewResult | null;
  completed: boolean;
  rewarded: boolean;
}

export interface ReviewDashboardItem extends ReviewQueueItem {
  status: "due" | "overdue" | "weak" | "improving" | "mastered";
}
