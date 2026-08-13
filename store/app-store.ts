"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  defaultPreferences,
  defaultProgress,
  defaultUser,
} from "@/data/default-learner-state";
import { customLessonRepository } from "@/lib/repositories/custom-lesson-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { settingsRepository } from "@/lib/repositories/settings-repository";
import type { BackendProgressSnapshot } from "@/lib/repositories/progress-repository";
import type {
  CustomLessonRequest,
  LessonReport,
  ProfileEdits,
  SubscriptionPlan,
  SupportRequest,
  UserSettings,
  UserSubscription,
} from "@/types/app-preferences";
import type { LessonPackage } from "@/types/lesson";
import type { LessonCompletionResult, LessonSession } from "@/types/lesson-session";
import type {
  DailyMinutes,
  LearnerLevel,
  LearningGoal,
  OnboardingPreferences,
  UserProfile,
} from "@/types/learner";
import type { LearnerProgress, RecentLesson } from "@/types/progress";

interface AppState {
  hasHydrated: boolean;
  backendSessionChecked: boolean;
  isAuthenticated: boolean;
  user: UserProfile;
  onboarding: OnboardingPreferences;
  progress: LearnerProgress;
  lessonSessions: Record<string, LessonSession>;
  savedLessonIds: string[];
  generatedLessons: LessonPackage[];
  customLessonRequests: CustomLessonRequest[];
  subscription: UserSubscription;
  settings: UserSettings;
  supportRequests: SupportRequest[];
  lessonReports: LessonReport[];
  setHasHydrated: (value: boolean) => void;
  setBackendSessionChecked: (value: boolean) => void;
  signIn: (name?: string) => void;
  syncBackendIdentity: (
    id: string,
    name: string,
    email: string,
    onboardingComplete: boolean,
  ) => void;
  hydrateBackendProgress: (snapshot: BackendProgressSnapshot) => void;
  signOut: () => void;
  setGoal: (goal: LearningGoal) => void;
  setLevel: (level: LearnerLevel) => void;
  setDailyMinutes: (minutes: DailyMinutes) => void;
  setInterests: (interests: string[]) => void;
  acknowledgeReading: () => void;
  completeOnboarding: () => void;
  updateProfile: (edits: ProfileEdits) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  setSubscription: (
    plan: SubscriptionPlan,
    billingPeriod?: UserSubscription["billingPeriod"],
  ) => void;
  cancelSubscription: () => void;
  toggleSavedLesson: (lessonId: string) => void;
  addGeneratedLesson: (lesson: LessonPackage) => void;
  removeGeneratedLesson: (lessonId: string) => void;
  addCustomLessonRequest: (request: CustomLessonRequest) => void;
  addSupportRequest: (request: SupportRequest) => void;
  addLessonReport: (report: LessonReport) => void;
  saveLessonProgress: (lessonId: string, percent: number) => void;
  startOrResumeLesson: (lessonId: string) => LessonSession;
  saveLessonSession: (session: LessonSession) => void;
  rewardLessonCompletion: (
    lesson: LessonPackage,
    result: LessonCompletionResult,
  ) => boolean;
  completeLesson: (lesson: RecentLesson) => void;
  resetLessonSession: (lessonId: string) => void;
  resetProgress: () => void;
}

const defaultSubscription: UserSubscription = {
  plan: "free",
  billingPeriod: "monthly",
  status: "active",
};

const defaultSettings: UserSettings = {
  lessonLength: 30,
  preferredFocus: "balanced",
  readingDifficulty: "balanced",
  speakingDifficulty: "medium",
  audioVolume: 75,
  autoplay: false,
  playbackSpeed: 1,
  showTranscript: true,
  microphonePermission: "not-asked",
  readingHighlights: true,
  pronunciationFeedback: true,
  dailyReminder: true,
  reviewReminder: true,
  streakReminder: true,
  weeklyReport: true,
  customLessonReady: true,
  theme: "light",
};

const initialState = {
  isAuthenticated: false,
  user: defaultUser,
  onboarding: defaultPreferences,
  progress: defaultProgress,
  lessonSessions: {},
  savedLessonIds: [],
  generatedLessons: [],
  customLessonRequests: [],
  subscription: defaultSubscription,
  settings: defaultSettings,
  supportRequests: [],
  lessonReports: [],
};

const memoryFallback = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      if (typeof window === "undefined") return memoryFallback.get(name) ?? null;
      return window.localStorage.getItem(name);
    } catch {
      return memoryFallback.get(name) ?? null;
    }
  },
  setItem: (name, value) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(name, value);
      else memoryFallback.set(name, value);
    } catch {
      memoryFallback.set(name, value);
    }
  },
  removeItem: (name) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(name);
    } catch {
      // The in-memory copy is still cleared if browser storage is unavailable.
    }
    memoryFallback.delete(name);
  },
};

export function createEmptyLessonSession(lessonId: string): LessonSession {
  const timestamp = new Date().toISOString();
  return {
    lessonId,
    currentPhaseIndex: 0,
    activityIndex: 0,
    elapsedSeconds: 0,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedPhaseIds: [],
    activities: {},
    storyInteractions: [],
    storyComplete: false,
    vocabularyAnswers: [],
    grammarAnswers: [],
    readingAnswers: [],
    readingEvents: [],
    readingComplete: false,
    listeningEvents: [],
    listeningComplete: false,
    speakingEvents: [],
    speakingComplete: false,
    reviewAnswers: [],
    reviewResult: null,
    completionResult: null,
    completed: false,
    rewarded: false,
  };
}

export function normalizeLessonSession(
  lessonId: string,
  value: unknown,
): LessonSession {
  const empty = createEmptyLessonSession(lessonId);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return empty;
  }

  const session = value as Partial<LessonSession>;
  const integer = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" && Number.isInteger(candidate)
      ? candidate
      : fallback;
  const timestamp = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" && candidate.length > 0
      ? candidate
      : fallback;

  return {
    ...empty,
    ...session,
    lessonId,
    currentPhaseIndex: Math.max(
      0,
      Math.min(6, integer(session.currentPhaseIndex, 0)),
    ),
    activityIndex: Math.max(0, integer(session.activityIndex, 0)),
    elapsedSeconds: Math.max(0, integer(session.elapsedSeconds, 0)),
    startedAt: timestamp(session.startedAt, empty.startedAt),
    updatedAt: timestamp(session.updatedAt, empty.updatedAt),
    completedPhaseIds: Array.isArray(session.completedPhaseIds)
      ? session.completedPhaseIds
      : [],
    activities:
      typeof session.activities === "object" &&
      session.activities !== null &&
      !Array.isArray(session.activities)
        ? session.activities
        : {},
    storyInteractions: Array.isArray(session.storyInteractions)
      ? session.storyInteractions
      : [],
    storyComplete: session.storyComplete === true,
    vocabularyAnswers: Array.isArray(session.vocabularyAnswers)
      ? session.vocabularyAnswers
      : [],
    grammarAnswers: Array.isArray(session.grammarAnswers)
      ? session.grammarAnswers
      : [],
    readingAnswers: Array.isArray(session.readingAnswers)
      ? session.readingAnswers
      : [],
    readingEvents: Array.isArray(session.readingEvents)
      ? session.readingEvents
      : [],
    readingComplete: session.readingComplete === true,
    listeningEvents: Array.isArray(session.listeningEvents)
      ? session.listeningEvents
      : [],
    listeningComplete: session.listeningComplete === true,
    speakingEvents: Array.isArray(session.speakingEvents)
      ? session.speakingEvents
      : [],
    speakingComplete: session.speakingComplete === true,
    reviewAnswers: Array.isArray(session.reviewAnswers)
      ? session.reviewAnswers
      : [],
    reviewResult: session.reviewResult ?? null,
    completionResult: session.completionResult ?? null,
    completed: session.completed === true,
    rewarded: session.rewarded === true,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,
      backendSessionChecked: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setBackendSessionChecked: (value) => set({ backendSessionChecked: value }),
      signIn: (name) =>
        set((state) => ({
          isAuthenticated: true,
          user: { ...state.user, name: name?.trim() || state.user.name },
        })),
      syncBackendIdentity: (id, name, email, onboardingComplete) =>
        set((state) => ({
          isAuthenticated: true,
          user: {
            ...state.user,
            id,
            name: name.trim() || "Learner",
            email,
          },
          onboarding: {
            ...state.onboarding,
            completed: onboardingComplete,
          },
        })),
      hydrateBackendProgress: (snapshot) =>
        set((state) => ({
          user: {
            ...state.user,
            level: snapshot.currentLevel,
            dailyGoalMinutes: snapshot.dailyGoalMinutes,
            minutesStudiedToday: snapshot.minutesStudiedToday,
            joinDate: snapshot.joinDate,
            xp: snapshot.xp,
            streakDays: snapshot.streakDays,
          },
          onboarding: {
            ...state.onboarding,
            goal: snapshot.learningGoal,
            level: snapshot.currentLevel,
            dailyMinutes: snapshot.dailyGoalMinutes as DailyMinutes,
            interests: snapshot.interests,
          },
          progress: {
            ...state.progress,
            levelCompletion: snapshot.levelCompletion,
            learnedVocabularyCount: snapshot.learnedVocabularyCount,
            learnedKanjiCount: snapshot.learnedKanjiCount,
            learnedGrammarCount: snapshot.learnedGrammarCount,
            weeklyActivity: snapshot.weeklyActivity,
            weakKanji: snapshot.weakKanji,
            weakVocabulary: snapshot.weakVocabulary,
            grammarToReview: snapshot.grammarToReview,
            recentLessons: snapshot.recentLessons,
            completedLessonIds: snapshot.completedLessonIds,
            longestStreak: snapshot.longestStreak,
            totalStudyMinutes: snapshot.totalStudyMinutes,
            achievements: snapshot.achievements,
          },
        })),
      signOut: () =>
        set({
          ...initialState,
          backendSessionChecked: true,
        }),
      setGoal: (goal) =>
        set((state) => ({ onboarding: { ...state.onboarding, goal } })),
      setLevel: (level) =>
        set((state) => ({
          onboarding: { ...state.onboarding, level },
          user: {
            ...state.user,
            level: level === "Not sure" || level === "Beginner" ? "N5" : level,
          },
        })),
      setDailyMinutes: (dailyMinutes) =>
        set((state) => ({
          onboarding: { ...state.onboarding, dailyMinutes },
          user: { ...state.user, dailyGoalMinutes: dailyMinutes },
        })),
      setInterests: (interests) =>
        set((state) => ({ onboarding: { ...state.onboarding, interests } })),
      acknowledgeReading: () =>
        set((state) => ({
          onboarding: {
            ...state.onboarding,
            readingPermissionUnderstood: true,
          },
        })),
      completeOnboarding: () =>
        set((state) => ({
          onboarding: { ...state.onboarding, completed: true },
        })),
      updateProfile: (edits) =>
        set((state) => ({
          user: {
            ...state.user,
            name: edits.name.trim() || state.user.name,
            level: edits.level,
            dailyGoalMinutes: edits.dailyMinutes,
          },
          onboarding: {
            ...state.onboarding,
            goal: edits.goal,
            level: edits.level,
            dailyMinutes: edits.dailyMinutes,
            interests: edits.interests,
          },
        })),
      updateSettings: (next) => {
        const settings = { ...get().settings, ...next };
        set({ settings });
        if (getBackendMode() === "supabase") void settingsRepository.save(settings);
      },
      setSubscription: (plan, billingPeriod) =>
        set((state) => ({
          subscription: {
            plan,
            billingPeriod: billingPeriod ?? state.subscription.billingPeriod,
            status: "active",
          },
        })),
      cancelSubscription: () =>
        set((state) => ({
          subscription: {
            ...state.subscription,
            plan: "free",
            status: "cancelled",
            renewsAt: undefined,
          },
        })),
      toggleSavedLesson: (lessonId) =>
        set((state) => ({
          savedLessonIds: state.savedLessonIds.includes(lessonId)
            ? state.savedLessonIds.filter((id) => id !== lessonId)
            : [...state.savedLessonIds, lessonId],
        })),
      addGeneratedLesson: (lesson) =>
        set((state) => ({
          generatedLessons: [
            lesson,
            ...state.generatedLessons.filter((item) => item.id !== lesson.id),
          ],
        })),
      removeGeneratedLesson: (lessonId) =>
        set((state) => ({
          generatedLessons: state.generatedLessons.filter(
            (lesson) => lesson.id !== lessonId,
          ),
        })),
      addCustomLessonRequest: (request) => {
        set((state) => ({
          customLessonRequests: [request, ...state.customLessonRequests],
        }));
        if (getBackendMode() === "supabase") {
          void customLessonRepository.create(request);
        }
      },
      addSupportRequest: (request) =>
        set((state) => ({
          supportRequests: [request, ...state.supportRequests],
        })),
      addLessonReport: (report) =>
        set((state) => ({ lessonReports: [report, ...state.lessonReports] })),
      saveLessonProgress: (lessonId, percent) =>
        set((state) => ({
          progress: {
            ...state.progress,
            lessonProgress: {
              ...state.progress.lessonProgress,
              [lessonId]: percent,
            },
          },
        })),
      startOrResumeLesson: (lessonId) => {
        const existing = get().lessonSessions[lessonId];
        if (existing) {
          const session = normalizeLessonSession(lessonId, existing);
          set((state) => ({
            lessonSessions: {
              ...state.lessonSessions,
              [lessonId]: session,
            },
          }));
          return session;
        }
        const session = createEmptyLessonSession(lessonId);
        set((state) => ({
          lessonSessions: { ...state.lessonSessions, [lessonId]: session },
          progress: {
            ...state.progress,
            lessonProgress: {
              ...state.progress.lessonProgress,
              [lessonId]: 1,
            },
          },
        }));
        return session;
      },
      saveLessonSession: (value) => {
        const session = normalizeLessonSession(value.lessonId, value);
        set((state) => ({
          lessonSessions: {
            ...state.lessonSessions,
            [session.lessonId]: {
              ...session,
              updatedAt: new Date().toISOString(),
            },
          },
          progress: {
            ...state.progress,
            lessonProgress: {
              ...state.progress.lessonProgress,
              [session.lessonId]: session.completed
                ? 100
                : Math.max(
                    1,
                    Math.round((session.currentPhaseIndex / 7) * 100),
                  ),
            },
          },
        }));
      },
      rewardLessonCompletion: (lesson, result) => {
        const session = get().lessonSessions[lesson.id];
        if (!session || session.rewarded) return false;
        set((state) => {
          const currentSession = state.lessonSessions[lesson.id];
          if (!currentSession || currentSession.rewarded) return state;
          const recentLesson: RecentLesson = {
            lessonId: lesson.id,
            title: lesson.title,
            completedAt: "Just now",
            score: result.score,
            durationMinutes: result.durationMinutes,
          };
          return {
            user: {
              ...state.user,
              xp: state.user.xp + result.xpGained,
              streakDays: Math.max(state.user.streakDays, 1),
              minutesStudiedToday:
                state.user.minutesStudiedToday + result.durationMinutes,
            },
            progress: {
              ...state.progress,
              completedLessonIds: [
                ...new Set([...state.progress.completedLessonIds, lesson.id]),
              ],
              recentLessons: [
                recentLesson,
                ...state.progress.recentLessons.filter(
                  (item) => item.lessonId !== lesson.id,
                ),
              ],
              lessonProgress: {
                ...state.progress.lessonProgress,
                [lesson.id]: 100,
              },
              weeklyActivity: addMinutesToToday(
                state.progress.weeklyActivity,
                result.durationMinutes,
              ),
              totalStudyMinutes:
                state.progress.totalStudyMinutes + result.durationMinutes,
              weakVocabulary: mergeWeakVocabulary(
                state.progress.weakVocabulary,
                result.wordsNeedingReview,
              ),
              kanjiRecognition: Math.min(
                100,
                state.progress.kanjiRecognition + result.recognitionChange,
              ),
              pronunciation: Math.min(
                100,
                state.progress.pronunciation + result.pronunciationChange,
              ),
              grammarUnderstanding: Math.min(
                100,
                state.progress.grammarUnderstanding +
                  result.grammarUnderstandingChange,
              ),
              grammarProduction: Math.min(
                100,
                state.progress.grammarProduction + result.grammarProductionChange,
              ),
              speakingConfidence: Math.min(
                100,
                state.progress.speakingConfidence + result.pronunciationChange,
              ),
            },
            lessonSessions: {
              ...state.lessonSessions,
              [lesson.id]: {
                ...currentSession,
                completed: true,
                rewarded: true,
                completionResult: result,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        return true;
      },
      completeLesson: (lesson) =>
        set((state) => ({
          progress: {
            ...state.progress,
            completedLessonIds: [
              ...new Set([
                ...state.progress.completedLessonIds,
                lesson.lessonId,
              ]),
            ],
            recentLessons: [
              lesson,
              ...state.progress.recentLessons.filter(
                (item) => item.lessonId !== lesson.lessonId,
              ),
            ],
            lessonProgress: {
              ...state.progress.lessonProgress,
              [lesson.lessonId]: 100,
            },
          },
        })),
      resetLessonSession: (lessonId) =>
        set((state) => {
          const lessonSessions = { ...state.lessonSessions };
          delete lessonSessions[lessonId];
          return {
            lessonSessions,
            progress: {
              ...state.progress,
              lessonProgress: {
                ...state.progress.lessonProgress,
                [lessonId]: 0,
              },
            },
          };
        }),
      resetProgress: () =>
        set({
          progress: defaultProgress,
          lessonSessions: {},
        }),
    }),
    {
      name: "aiko-app-state",
      version: 5,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persistedState) => persistedState as Partial<AppState>,
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppState>;
        return {
          ...current,
          onboarding: { ...current.onboarding, ...saved.onboarding },
          progress: {
            ...current.progress,
            lessonProgress: saved.progress?.lessonProgress ?? {},
          },
          lessonSessions: Object.fromEntries(
            Object.entries(saved.lessonSessions ?? {}).map(
              ([lessonId, session]) => [
                lessonId,
                normalizeLessonSession(lessonId, session),
              ],
            ),
          ),
          savedLessonIds: saved.savedLessonIds ?? [],
          generatedLessons: saved.generatedLessons ?? [],
          customLessonRequests: saved.customLessonRequests ?? [],
          settings: { ...current.settings, ...saved.settings },
          hasHydrated: false,
          backendSessionChecked: false,
          isAuthenticated: false,
          user: current.user,
          subscription: current.subscription,
          supportRequests: [],
          lessonReports: [],
        };
      },
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);

function addMinutesToToday(
  activity: LearnerProgress["weeklyActivity"],
  minutes: number,
): LearnerProgress["weeklyActivity"] {
  if (!activity.length) return activity;
  const index = activity.length - 1;
  return activity.map((day, dayIndex) =>
    dayIndex === index ? { ...day, minutes: day.minutes + minutes } : day,
  );
}

function mergeWeakVocabulary(
  existing: LearnerProgress["weakVocabulary"],
  terms: string[],
): LearnerProgress["weakVocabulary"] {
  const additions = terms
    .filter((term) => !existing.some((item) => item.term === term))
    .map((term) => ({
      term,
      meaning: "lesson target",
      mastery: 45,
    }));
  return [...existing, ...additions];
}
