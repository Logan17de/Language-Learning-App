export type LearningGoal =
  | "JLPT preparation"
  | "Conversation"
  | "Workplace Japanese"
  | "Daily life in Japan"
  | "Travel";

export type LearnerLevel =
  | "Beginner"
  | "N5"
  | "N4"
  | "N3"
  | "N2"
  | "N1"
  | "Not sure";
export type DailyMinutes = 15 | 30 | 45 | 60;

export interface OnboardingPreferences {
  goal: LearningGoal | null;
  level: LearnerLevel | null;
  dailyMinutes: DailyMinutes | null;
  readingPermissionUnderstood: boolean;
  completed: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  level: LearnerLevel;
  streakDays: number;
  xp: number;
  dailyGoalMinutes: number;
  minutesStudiedToday: number;
  joinDate: string;
}
