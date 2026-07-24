import type { OnboardingPreferences, UserProfile } from "@/types/learner";

export const mockUser: UserProfile = {
  id: "user_hana_001",
  name: "Hana",
  email: "hana@example.com",
  level: "N4",
  streakDays: 12,
  xp: 2840,
  dailyGoalMinutes: 30,
  minutesStudiedToday: 18,
  joinDate: "2026-04-12",
};

export const defaultPreferences: OnboardingPreferences = {
  goal: null,
  level: null,
  dailyMinutes: null,
  interests: [],
  readingPermissionUnderstood: false,
  completed: false,
};
