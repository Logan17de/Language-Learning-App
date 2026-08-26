import type { OnboardingPreferences, UserProfile } from "@/types/learner";
import type { LearnerProgress } from "@/types/progress";

export const defaultUser: UserProfile = {
  id: "",
  name: "Learner",
  email: "",
  level: "N5",
  streakDays: 0,
  xp: 0,
  dailyGoalMinutes: 30,
  minutesStudiedToday: 0,
  joinDate: "",
};

export const defaultPreferences: OnboardingPreferences = {
  goal: null,
  level: null,
  dailyMinutes: null,
  readingPermissionUnderstood: false,
  completed: false,
};

export const defaultProgress: LearnerProgress = {
  levelCompletion: 0,
  learnedVocabularyCount: 0,
  learnedKanjiCount: 0,
  learnedGrammarCount: 0,
  completedLessonIds: [],
};
