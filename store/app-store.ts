"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  defaultPreferences,
  defaultProgress,
  defaultUser,
} from "@/data/default-learner-state";
import { CANONICAL_LESSON_PHASES } from "@/lib/lesson-contract";
import { customLessonRepository } from "@/lib/repositories/custom-lesson-repository";
import { getBackendMode } from "@/lib/supabase/config";
import { settingsRepository } from "@/lib/repositories/settings-repository";
import type { BackendProgressSnapshot } from "@/lib/repositories/progress-repository";
import type {
  CustomLessonRequest,
  LessonFocus,
  LessonReport,
  ProfileEdits,
  SubscriptionPlan,
  SupportRequest,
  ThemePreference,
  UserSettings,
  UserSubscription,
} from "@/types/app-preferences";
import type { LessonPackage } from "@/types/lesson";
import type {
  LessonCompletionResult,
  LessonPhaseId,
  LessonSession,
} from "@/types/lesson-session";
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

const canonicalPhaseIds = new Set<LessonPhaseId>(
  CANONICAL_LESSON_PHASES.map((phase) => phase.id),
);

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

function normalizeUserSettings(value: unknown): UserSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const lessonLength = [15, 30, 45, 60].includes(Number(source.lessonLength))
    ? Number(source.lessonLength) as UserSettings["lessonLength"]
    : defaultSettings.lessonLength;
  const focuses: LessonFocus[] = [
    "balanced",
    "conversation",
    "vocabulary",
    "grammar",
    "reading",
    "speaking",
    "workplace Japanese",
  ];
  const preferredFocus = typeof source.preferredFocus === "string" &&
    focuses.includes(source.preferredFocus as LessonFocus)
    ? source.preferredFocus as LessonFocus
    : defaultSettings.preferredFocus;
  const readingDifficulties: UserSettings["readingDifficulty"][] = [
    "guided",
    "balanced",
    "independent",
  ];
  const readingDifficulty = typeof source.readingDifficulty === "string" &&
    readingDifficulties.includes(
      source.readingDifficulty as UserSettings["readingDifficulty"],
    )
    ? source.readingDifficulty as UserSettings["readingDifficulty"]
    : defaultSettings.readingDifficulty;
  const speakingDifficulties: UserSettings["speakingDifficulty"][] = [
    "easy",
    "medium",
    "hard",
  ];
  const speakingDifficulty = typeof source.speakingDifficulty === "string" &&
    speakingDifficulties.includes(
      source.speakingDifficulty as UserSettings["speakingDifficulty"],
    )
    ? source.speakingDifficulty as UserSettings["speakingDifficulty"]
    : defaultSettings.speakingDifficulty;
  const themes: ThemePreference[] = ["light", "dark", "system"];
  const theme = typeof source.theme === "string" &&
    themes.includes(source.theme as ThemePreference)
    ? source.theme as ThemePreference
    : defaultSettings.theme;

  return {
    lessonLength,
    preferredFocus,
    readingDifficulty,
    speakingDifficulty,
    theme,
  };
}

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
    grammarTranslationQuestions: [],
    readingAnswers: [],
    readingEvents: [],
    readingComplete: false,
    listeningEvents: [],
    listeningComplete: false,
    speakingEvents: [],
    speakingComplete: false,
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

  const session = value as Partial<LessonSession> & {
    completedPhaseIds?: unknown;
  };
  const integer = (candidate: unknown, fallback: number) =>
    typeof candidate === "number" && Number.isInteger(candidate)
      ? candidate
      : fallback;
  const timestamp = (candidate: unknown, fallback: string) =>
    typeof candidate === "string" && candidate.length > 0
      ? candidate
      : fallback;
  const completedPhaseIds = Array.isArray(session.completedPhaseIds)
    ? session.completedPhaseIds.filter(
        (phaseId): phaseId is LessonPhaseId =>
          typeof phaseId === "string" &&
          canonicalPhaseIds.has(phaseId as LessonPhaseId),
      )
    : [];

  return {
    ...empty,
    ...session,
    lessonId,
    currentPhaseIndex: Math.max(
      0,
      Math.min(
        CANONICAL_LESSON_PHASES.length - 1,
        integer(session.currentPhaseIndex, 0),
      ),
    ),
    activityIndex: Math.max(0, integer(session.activityIndex, 0)),
    elapsedSeconds: Math.max(0, integer(session.elapsedSeconds, 0)),
    startedAt: timestamp(session.startedAt, empty.startedAt),
    updatedAt: timestamp(session.updatedAt, empty.updatedAt),
    completedPhaseIds,
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
    grammarTranslationQuestions: Array.isArray(session.grammarTranslationQuestions)
      ? session.grammarTranslationQuestions
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
          hasHydrated: true,
        }),
      setGoal: (goal) =>
        set((state) => ({ onboarding: { ...state.onboarding, goal } })),
      setLevel: (level) =>
        set((state) => ({ onboarding: { ...state.onboarding, level } })),
      setDailyMinutes: (dailyMinutes) =>
        set((state) => ({ onboarding: { ...state.onboarding, dailyMinutes } })),
      setInterests: (interests) =>
        set((state) => ({ onboarding: { ...state.onboarding, interests } })),
      acknowledgeReading: () =>
        set((state) => ({
          onboarding: { ...state.onboarding, readingAcknowledged: true },
        })),
      completeOnboarding: () =>
        set((state) => ({
          onboarding: { ...state.onboarding, completed: true },
          user: {
            ...state.user,
            level:
              state.onboarding.level && state.onboarding.level !== "Not sure"
                ? state.onboarding.level
                : state.user.level,
            dailyGoalMinutes:
              state.onboarding.dailyMinutes ?? state.user.dailyGoalMinutes,
          },
        })),
      updateProfile: (edits) =>
        set((state) => ({ user: { ...state.user, ...edits } })),
      updateSettings: (settings) => {
        set((state) => ({ settings: { ...state.settings, ...settings } }));
        if (getBackendMode() === "supabase") {
          void settingsRepository.save(settings);
        }
      },
      setSubscription: (plan, billingPeriod = "monthly") =>
        set({
          subscription: {
            plan,
            billingPeriod,
            status: "active",
          },
        }),
      cancelSubscription: () =>
        set((state) => ({
          subscription: { ...state.subscription, status: "cancelled" },
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
          savedLessonIds: state.savedLessonIds.filter((id) => id !== lessonId),
        })),
      addCustomLessonRequest: (request) => {
        set((state) => ({
          customLessonRequests: [request, ...state.customLessonRequests],
        }));
        if (getBackendMode() === "supabase") {
          void customLessonRepository.save(request);
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
            recentLessons: state.progress.recentLessons.map((lesson) =>
              lesson.id === lessonId ? { ...lesson, progress: percent } : lesson,
            ),
          },
        })),
      startOrResumeLesson: (lessonId) => {
        const existing = get().lessonSessions[lessonId];
        if (existing) return existing;
        const created = createEmptyLessonSession(lessonId);
        set((state) => ({
          lessonSessions: { ...state.lessonSessions, [lessonId]: created },
        }));
        return created;
      },
      saveLessonSession: (session) =>
        set((state) => ({
          lessonSessions: {
            ...state.lessonSessions,
            [session.lessonId]: { ...session, updatedAt: new Date().toISOString() },
          },
        })),
      rewardLessonCompletion: (lesson, result) => {
        const current = get().lessonSessions[lesson.id];
        if (!current || current.rewarded) return false;
        const nextStreak = get().user.streakDays + 1;
        set((state) => ({
          user: {
            ...state.user,
            xp: state.user.xp + result.xpGained,
            streakDays: nextStreak,
            longestStreak: Math.max(state.user.longestStreak, nextStreak),
            totalStudyMinutes: state.user.totalStudyMinutes + result.durationMinutes,
            minutesStudiedToday:
              state.user.minutesStudiedToday + result.durationMinutes,
          },
          progress: {
            ...state.progress,
            recentLessons: [
              {
                id: lesson.id,
                title: lesson.title,
                progress: 100,
                score: result.score,
                completedAt: result.completedAt,
              },
              ...state.progress.recentLessons.filter(
                (recent) => recent.id !== lesson.id,
              ),
            ].slice(0, 5),
            completedLessonIds: Array.from(
              new Set([...state.progress.completedLessonIds, lesson.id]),
            ),
          },
          lessonSessions: {
            ...state.lessonSessions,
            [lesson.id]: { ...current, rewarded: true },
          },
        }));
        return true;
      },
      completeLesson: (lesson) =>
        set((state) => ({
          progress: {
            ...state.progress,
            recentLessons: [
              lesson,
              ...state.progress.recentLessons.filter(
                (item) => item.id !== lesson.id,
              ),
            ].slice(0, 5),
            completedLessonIds: Array.from(
              new Set([...state.progress.completedLessonIds, lesson.id]),
            ),
          },
        })),
      resetLessonSession: (lessonId) =>
        set((state) => {
          const next = { ...state.lessonSessions };
          delete next[lessonId];
          return { lessonSessions: next };
        }),
      resetProgress: () =>
        set((state) => ({
          user: {
            ...state.user,
            xp: 0,
            streakDays: 0,
            longestStreak: 0,
            totalStudyMinutes: 0,
            minutesStudiedToday: 0,
          },
          progress: defaultProgress,
          lessonSessions: {},
        })),
    }),
    {
      name: "aiko-app-store",
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        user: state.user,
        onboarding: state.onboarding,
        progress: state.progress,
        lessonSessions: state.lessonSessions,
        savedLessonIds: state.savedLessonIds,
        generatedLessons: state.generatedLessons,
        customLessonRequests: state.customLessonRequests,
        subscription: state.subscription,
        settings: state.settings,
        supportRequests: state.supportRequests,
        lessonReports: state.lessonReports,
      }),
      merge: (persisted, current) => {
        const stored = persisted as Partial<AppState> | undefined;
        const lessonSessions = Object.fromEntries(
          Object.entries(stored?.lessonSessions ?? {}).map(([lessonId, session]) => [
            lessonId,
            normalizeLessonSession(lessonId, session),
          ]),
        );
        return {
          ...current,
          ...stored,
          settings: normalizeUserSettings(stored?.settings),
          lessonSessions,
          hasHydrated: true,
        };
      },
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
