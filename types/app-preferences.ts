import type { JLPTLevel, LessonPackage } from "@/types/lesson";
import type { LearnerLevel, LearningGoal } from "@/types/learner";

export type SubscriptionPlan = "free" | "premium";
export type BillingPeriod = "monthly" | "annual";

export interface UserSubscription {
  plan: SubscriptionPlan;
  billingPeriod: BillingPeriod;
  status: "active" | "cancelled";
  renewsAt?: string;
}

export type ThemePreference = "light" | "dark" | "system";
export type LessonFocus = "balanced" | "conversation" | "vocabulary" | "grammar" | "reading" | "speaking" | "workplace Japanese";

export interface UserSettings {
  lessonLength: 15 | 30 | 45 | 60;
  preferredFocus: LessonFocus;
  readingDifficulty: "guided" | "balanced" | "independent";
  speakingDifficulty: "easy" | "medium" | "hard";
  theme: ThemePreference;
}

export interface ProfileEdits {
  name: string;
  level: LearnerLevel;
  goal: LearningGoal;
  dailyMinutes: 15 | 30 | 45 | 60;
  interests: string[];
}

export interface CustomLessonRequest {
  id: string;
  topic: string;
  level: JLPTLevel;
  durationMinutes: 15 | 30 | 45 | 60;
  focus: LessonFocus;
  speakingDifficulty: "easy" | "medium" | "hard";
  note: string;
  outcome: "existing" | "variation" | "new";
  matchedLessonId?: string;
  generatedLessonId?: string;
  createdAt: string;
}

export type CustomLessonGenerationStage =
  | "Writing your story"
  | "Building lesson activities"
  | "Preparing lesson audio"
  | "Ready";

export interface CustomLessonMatch {
  outcome: "existing" | "variation" | "new";
  lesson?: LessonPackage;
  score: number;
}

export interface LessonReport {
  id: string;
  category:
    | "incorrect translation"
    | "incorrect reading"
    | "grammar explanation issue"
    | "wrong answer key"
    | "audio issue"
    | "image issue"
    | "inappropriate content"
    | "lesson too difficult"
    | "technical issue"
    | "other";
  details: string;
  lessonId: string;
  lessonTitle: string;
  phase?: string;
  activityId?: string;
  userAnswer?: string;
  route: string;
  createdAt: string;
}

export interface SupportRequest {
  id: string;
  type: "contact" | "technical" | "lesson" | "billing";
  email: string;
  subject: string;
  message: string;
  createdAt: string;
}
