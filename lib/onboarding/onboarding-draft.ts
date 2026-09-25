"use client";

import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";

const STORAGE_PREFIX = "aiko-onboarding-draft";
const MAX_STEP = 5;
const VALID_MINUTES: DailyMinutes[] = [15, 30, 45, 60];
const VALID_LEVELS: LearnerLevel[] = [
  "Beginner",
  "N5",
  "N4",
  "N3",
  "N2",
  "N1",
  "Not sure",
];
const VALID_GOALS: LearningGoal[] = [
  "JLPT preparation",
  "Conversation",
  "Workplace Japanese",
  "Daily life in Japan",
  "Travel",
];

export interface OnboardingDraft {
  step: number;
  displayName: string;
  goal: LearningGoal | null;
  level: LearnerLevel | null;
  dailyMinutes: DailyMinutes | null;
  speakingPracticeUnderstood: boolean;
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function createOnboardingDraft(displayName: string): OnboardingDraft {
  return {
    step: 0,
    displayName: displayName.trim() || "Learner",
    goal: null,
    level: null,
    dailyMinutes: null,
    speakingPracticeUnderstood: false,
  };
}

export function readOnboardingDraft(userId: string): OnboardingDraft | null {
  if (!userId || typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKey(userId));
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      step:
        typeof value.step === "number" && Number.isInteger(value.step)
          ? Math.max(0, Math.min(MAX_STEP, value.step))
          : 0,
      displayName:
        typeof value.displayName === "string"
          ? value.displayName.slice(0, 60)
          : "Learner",
      goal:
        typeof value.goal === "string" &&
        VALID_GOALS.includes(value.goal as LearningGoal)
          ? (value.goal as LearningGoal)
          : null,
      level:
        typeof value.level === "string" &&
        VALID_LEVELS.includes(value.level as LearnerLevel)
          ? (value.level as LearnerLevel)
          : null,
      dailyMinutes:
        typeof value.dailyMinutes === "number" &&
        VALID_MINUTES.includes(value.dailyMinutes as DailyMinutes)
          ? (value.dailyMinutes as DailyMinutes)
          : null,
      speakingPracticeUnderstood: value.speakingPracticeUnderstood === true,
    };
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(userId: string, draft: OnboardingDraft) {
  if (!userId || typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKey(userId), JSON.stringify(draft));
}

export function clearOnboardingDraft(userId: string) {
  if (!userId || typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKey(userId));
}

export function onboardingStepFromLocation(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("step");
  const step = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(step) && step >= 1 && step <= MAX_STEP + 1
    ? step - 1
    : null;
}
