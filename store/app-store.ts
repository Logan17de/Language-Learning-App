"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createJSONStorage } from "zustand/middleware";
import { commuteLesson } from "@/data/mock-lessons";
import { canonicalLessonPhases } from "@/lib/lesson-contract";
import type {
  AppNotification,
  AppProgress,
  AppSubscription,
  AppUser,
  PersistedAppState,
  UserPreferences,
} from "@/types/app";
import type { LessonPackage } from "@/types/lesson";
import type {
  GrammarAnswer,
  GrammarTranslationQuestion,
  LessonCompletionResult,
  LessonPhaseId,
  LessonSession,
  ListeningEvent,
  ReadingComprehensionAnswer,
  ReadingEvent,
  SpeakingEvent,
  StoryInteraction,
  VocabularyAnswer,
} from "@/types/lesson-session";

const APP_STORAGE_KEY = "aiko_app_state_v4";

const DEFAULT_PREFERENCES: UserPreferences = {
  dailyGoalMinutes: 15,
  furigana: true,
  romaji: false,
  audioAutoPlay: false,
  soundEffects: true,
  emailReminders: false,
  theme: "light",
};

const DEFAULT_USER: AppUser = {
  id: "",
  name: "Learner",
  email: "",
  level: "N5",
  streakDays: 0,
  xp: 0,
  minutesStudiedToday: 0,
  subscriptionTier: "free",
  joinedAt: "",
};

const DEFAULT_PROGRESS: AppProgress = {
  completedLessonIds: [],
  recentLessons: [],
  lessonProgress: {},
  weeklyActivity: [],
  totalStudyMinutes: 0,
  weakVocabulary: [],
  kanjiRecognition: 0,
  pronunciation: 0,
  grammarUnderstanding: 0,
  grammarProduction: 0,
  speakingConfidence: 0,
};

const DEFAULT_SUBSCRIPTION: AppSubscription = {
  tier: "free",
  status: "active",
  startedAt: "",
  renewsAt: "",
};

interface AppState extends PersistedAppState {
  hydrated: boolean;
  backendSessionChecked: boolean;
  loading: boolean;
  error: string;
  setHydrated: (hydrated: boolean) => void;
  setBackendSessionChecked: (checked: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  signIn: (user: Partial<AppUser>) => void;
  signOut: () => void;
  setUser: (user: Partial<AppUser>) => void;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  setSubscription: (subscription: Partial<AppSubscription>) => void;
  setProgress: (progress: Partial<AppProgress>) => void;
  setNotifications: (notifications: AppNotification[]) => void;
  markNotificationRead: (id: string) => void;
  startLessonSession: (lesson: LessonPackage) => void;
  resetLessonSession: (lessonId: string) => void;
  setLessonPhase: (lessonId: string, phaseIndex: number) => void;
  setLessonActivityIndex: (lessonId: string, activityIndex: number) => void;
  addLessonElapsedSeconds: (lessonId: string, seconds: number) => void;
  completeLessonPhase: (lessonId: string, phaseId: LessonPhaseId) => void;
  setStoryComplete: (lessonId: string, complete: boolean) => void;
  addStoryInteraction: (lessonId: string, interaction: StoryInteraction) => void;
  setVocabularyAnswers: (lessonId: string, answers: VocabularyAnswer[]) => void;
  setGrammarAnswers: (lessonId: string, answers: GrammarAnswer[]) => void;
  setGrammarTranslationQuestions: (
    lessonId: string,
    questions: GrammarTranslationQuestion[],
  ) => void;
  setReadingAnswers: (
    lessonId: string,
    answers: ReadingComprehensionAnswer[],
  ) => void;
  addReadingEvent: (lessonId: string, event: ReadingEvent) => void;
  setReadingComplete: (lessonId: string, complete: boolean) => void;
  addListeningEvent: (lessonId: string, event: ListeningEvent) => void;
  setListeningComplete: (lessonId: string, complete: boolean) => void;
  addSpeakingEvent: (lessonId: string, event: SpeakingEvent) => void;
  setSpeakingComplete: (lessonId: string, complete: boolean) => void;
  completeLesson: (lessonId: string, result: LessonCompletionResult) => void;
  rewardLessonCompletion: (
    lesson: LessonPackage,
    result: LessonCompletionResult,
  ) => void;
}

function initialPersistedState(): PersistedAppState {
  return {
    user: { ...DEFAULT_USER },
    preferences: { ...DEFAULT_PREFERENCES },
    progress: { ...DEFAULT_PROGRESS },
    subscription: { ...DEFAULT_SUBSCRIPTION },
    notifications: [],
    lessonSessions: {},
  };
}

export function createEmptyLessonSession(lessonId: string): LessonSession {
  const now = new Date().toISOString();
  return {
    lessonId,
    currentPhaseIndex: 0,
    activityIndex: 0,
    elapsedSeconds: 0,
    startedAt: now,
    updatedAt: now,
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

function updateLessonSession(
  sessions: Record<string, LessonSession>,
  lessonId: string,
  updater: (session: LessonSession) => LessonSession,
): Record<string, LessonSession> {
  const current = sessions[lessonId] ?? createEmptyLessonSession(lessonId);
  return {
    ...sessions,
    [lessonId]: updater(current),
  };
}

function markUpdated(session: LessonSession): LessonSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

function mergeWeakVocabulary(current: string[], additions: string[]): string[] {
  return Array.from(new Set([...additions, ...current])).slice(0, 12);
}

function addMinutesToToday(
  activity: AppProgress["weeklyActivity"],
  minutes: number,
): AppProgress["weeklyActivity"] {
  const today = new Date().toISOString().slice(0, 10);
  const existingIndex = activity.findIndex((item) => item.date === today);
  if (existingIndex === -1) {
    return [...activity, { date: today, minutes }].slice(-7);
  }
  return activity.map((item, index) =>
    index === existingIndex ? { ...item, minutes: item.minutes + minutes } : item,
  );
}

function normalizePersistedState(value: unknown): PersistedAppState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return initialPersistedState();
  }
  const source = value as Partial<PersistedAppState>;
  return {
    user: { ...DEFAULT_USER, ...(source.user ?? {}) },
    preferences: { ...DEFAULT_PREFERENCES, ...(source.preferences ?? {}) },
    progress: { ...DEFAULT_PROGRESS, ...(source.progress ?? {}) },
    subscription: { ...DEFAULT_SUBSCRIPTION, ...(source.subscription ?? {}) },
    notifications: Array.isArray(source.notifications) ? source.notifications : [],
    lessonSessions:
      source.lessonSessions && typeof source.lessonSessions === "object"
        ? source.lessonSessions
        : {},
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialPersistedState(),
      hydrated: false,
      backendSessionChecked: false,
      loading: false,
      error: "",
      setHydrated: (hydrated) => set({ hydrated }),
      setBackendSessionChecked: (backendSessionChecked) =>
        set({ backendSessionChecked }),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      signIn: (user) =>
        set((state) => ({
          user: { ...state.user, ...user },
        })),
      signOut: () =>
        set({
          ...initialPersistedState(),
          backendSessionChecked: true,
          error: "",
        }),
      setUser: (user) =>
        set((state) => ({ user: { ...state.user, ...user } })),
      setPreferences: (preferences) =>
        set((state) => ({
          preferences: { ...state.preferences, ...preferences },
        })),
      setSubscription: (subscription) =>
        set((state) => ({
          subscription: { ...state.subscription, ...subscription },
        })),
      setProgress: (progress) =>
        set((state) => ({ progress: { ...state.progress, ...progress } })),
      setNotifications: (notifications) => set({ notifications }),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id
              ? { ...notification, read: true }
              : notification,
          ),
        })),
      startLessonSession: (lesson) =>
        set((state) => {
          const existing = state.lessonSessions[lesson.id];
          return {
            lessonSessions: existing
              ? state.lessonSessions
              : {
                  ...state.lessonSessions,
                  [lesson.id]: createEmptyLessonSession(lesson.id),
                },
          };
        }),
      resetLessonSession: (lessonId) =>
        set((state) => ({
          lessonSessions: {
            ...state.lessonSessions,
            [lessonId]: createEmptyLessonSession(lessonId),
          },
        })),
      setLessonPhase: (lessonId, phaseIndex) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                currentPhaseIndex: Math.max(0, phaseIndex),
                activityIndex: 0,
              }),
          ),
        })),
      setLessonActivityIndex: (lessonId, activityIndex) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                activityIndex: Math.max(0, activityIndex),
              }),
          ),
        })),
      addLessonElapsedSeconds: (lessonId, seconds) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                elapsedSeconds: session.elapsedSeconds + Math.max(0, seconds),
              }),
          ),
        })),
      completeLessonPhase: (lessonId, phaseId) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                completedPhaseIds: [
                  ...new Set([...session.completedPhaseIds, phaseId]),
                ],
              }),
          ),
        })),
      setStoryComplete: (lessonId, complete) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, storyComplete: complete }),
          ),
        })),
      addStoryInteraction: (lessonId, interaction) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                storyInteractions: [...session.storyInteractions, interaction],
              }),
          ),
        })),
      setVocabularyAnswers: (lessonId, answers) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, vocabularyAnswers: answers }),
          ),
        })),
      setGrammarAnswers: (lessonId, answers) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, grammarAnswers: answers }),
          ),
        })),
      setGrammarTranslationQuestions: (lessonId, questions) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({ ...session, grammarTranslationQuestions: questions }),
          ),
        })),
      setReadingAnswers: (lessonId, answers) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, readingAnswers: answers }),
          ),
        })),
      addReadingEvent: (lessonId, event) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                readingEvents: [...session.readingEvents, event],
              }),
          ),
        })),
      setReadingComplete: (lessonId, complete) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, readingComplete: complete }),
          ),
        })),
      addListeningEvent: (lessonId, event) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                listeningEvents: [...session.listeningEvents, event],
              }),
          ),
        })),
      setListeningComplete: (lessonId, complete) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, listeningComplete: complete }),
          ),
        })),
      addSpeakingEvent: (lessonId, event) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                speakingEvents: [...session.speakingEvents, event],
              }),
          ),
        })),
      setSpeakingComplete: (lessonId, complete) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) => markUpdated({ ...session, speakingComplete: complete }),
          ),
        })),
      completeLesson: (lessonId, result) =>
        set((state) => ({
          lessonSessions: updateLessonSession(
            state.lessonSessions,
            lessonId,
            (session) =>
              markUpdated({
                ...session,
                completionResult: result,
                completed: true,
              }),
          ),
        })),
      rewardLessonCompletion: (lesson, result) => {
        const session = get().lessonSessions[lesson.id];
        if (session?.rewarded) return;
        set((state) => {
          const currentSession =
            state.lessonSessions[lesson.id] ?? createEmptyLessonSession(lesson.id);
          if (currentSession.rewarded) return {};
          const recentLesson = {
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
                result.weakItems,
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
              [lesson.id]: markUpdated({
                ...currentSession,
                completionResult: result,
                completed: true,
                rewarded: true,
              }),
            },
          };
        });
      },
    }),
    {
      name: APP_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        preferences: state.preferences,
        progress: state.progress,
        subscription: state.subscription,
        notifications: state.notifications,
        lessonSessions: state.lessonSessions,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalizePersistedState(persisted),
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function getCurrentLesson(): LessonPackage {
  return {
    ...commuteLesson,
    phases: canonicalLessonPhases(),
  };
}
