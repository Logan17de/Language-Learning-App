"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  initialAdminSettings,
  initialAdminUsers,
  initialAudio,
  initialCurriculumItems,
  initialGrammar,
  initialImages,
  initialKanji,
  initialLessonOverrides,
  initialLessonStats,
  initialReportStates,
  initialSubscriptions,
  initialSupportTickets,
  initialValidations,
  initialVocabulary,
  mockAdminCredentials,
} from "@/data/mock-admin";
import { useAppStore } from "@/store/app-store";
import { adminSafeStorage, migrateAdminStore } from "@/store/admin-store-migrations";
import type { AdminStoreState } from "@/store/admin-store-types";
import type {
  AdminLessonReportState,
  AuditEntityType,
  AuditLogEntry,
  LessonValidation,
  SupportTicket,
} from "@/types/admin";
import type { LessonPackage } from "@/types/lesson";
import { buildValidationChecks } from "@/lib/generated-validation";

const signedOutSession: AdminStoreState["session"] = {
  authenticated: false,
  email: "",
  displayName: "Aiko Admin",
  role: "Content administrator",
};

const initialState = {
  storageAvailable: true,
  session: signedOutSession,
  lessonOverrides: initialLessonOverrides,
  deletedLessonIds: [] as string[],
  lessonStats: initialLessonStats,
  validations: initialValidations,
  curriculumItems: initialCurriculumItems,
  grammarRecords: initialGrammar,
  kanjiRecords: initialKanji,
  vocabularyRecords: initialVocabulary,
  imageAssets: initialImages,
  audioAssets: initialAudio,
  users: initialAdminUsers,
  subscriptions: initialSubscriptions,
  reportStates: initialReportStates,
  supportTickets: initialSupportTickets,
  auditLog: [] as AuditLogEntry[],
  settings: initialAdminSettings,
  indexRebuiltAt: undefined as string | undefined,
};

function timestamp(): string {
  return new Date().toISOString();
}

function audit(
  state: Pick<AdminStoreState, "auditLog" | "session">,
  action: string,
  entityType: AuditEntityType,
  entityId: string,
  summary: string,
): AuditLogEntry[] {
  const entry: AuditLogEntry = {
    id: `audit_${Date.now()}_${state.auditLog.length}`,
    timestamp: timestamp(),
    adminUser: state.session.email || mockAdminCredentials.email,
    action,
    entityType,
    entityId,
    summary,
  };
  return [entry, ...state.auditLog].slice(0, 300);
}

function createValidation(lesson: LessonPackage): LessonValidation {
  const malformed = !lesson.answerKeys.length || !lesson.reviewQuestions.length || !lesson.listeningExercises.length;
  return {
    lessonId: lesson.id,
    requestedTopic: lesson.topic,
    requester: "Learner-generated request",
    generatedAt: timestamp(),
    generationSeconds: 16,
    score: malformed ? 44 : 89,
    status: malformed ? "failed" : "needs human review",
    warnings: malformed ? ["Required exercise or answer data is missing."] : ["Human language review is pending."],
    checks: buildValidationChecks({
      schema_answers: malformed ? "failed" : "passed",
      schema_phases: malformed ? "failed" : "passed",
      alignment_listening: malformed ? "failed" : "passed",
      alignment_review: malformed ? "failed" : "passed",
      language_natural: "warning",
    }).map((check) => ({ ...check, id: `${lesson.id}_${check.id}` })),
    history: [{
      id: `history_${lesson.id}_1`,
      timestamp: timestamp(),
      admin: "System validator",
      score: malformed ? 44 : 89,
      outcome: malformed ? "failed" : "warning",
      note: malformed ? "Schema validation failed." : "Automated checks completed.",
    }],
  };
}

export const useAdminStore = create<AdminStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      login: (email, password) => {
        const valid = email.trim().toLowerCase() === mockAdminCredentials.email && password === mockAdminCredentials.password;
        if (!valid) return false;
        set({
          session: {
            authenticated: true,
            email: mockAdminCredentials.email,
            displayName: "Aiko Admin",
            role: "Content administrator",
            signedInAt: timestamp(),
          },
        });
        return true;
      },
      establishBackendSession: (email, displayName, role) => set({
        session: {
          authenticated: true,
          email,
          displayName,
          role,
          signedInAt: timestamp(),
        },
      }),
      logout: () => set({ session: signedOutSession }),
      saveLesson: (lesson, action = "lesson edited") => {
        if (lesson.source === "user_generated") useAppStore.getState().addGeneratedLesson(lesson);
        set((state) => ({
          lessonOverrides: { ...state.lessonOverrides, [lesson.id]: lesson },
          deletedLessonIds: state.deletedLessonIds.filter((id) => id !== lesson.id),
          lessonStats: state.lessonStats.some((item) => item.lessonId === lesson.id)
            ? state.lessonStats.map((item) => item.lessonId === lesson.id ? { ...item, updatedAt: timestamp().slice(0, 10) } : item)
            : [{ lessonId: lesson.id, completionCount: 0, averageScore: 0, reportCount: 0, updatedAt: timestamp().slice(0, 10), completionRate: 0, failureRate: 0 }, ...state.lessonStats],
          auditLog: audit(state, action, "lesson", lesson.id, `${lesson.title} saved as ${lesson.status}.`),
        }));
      },
      updateLessonStatus: (lesson, status) => {
        const updated = { ...lesson, status };
        if (updated.source === "user_generated") useAppStore.getState().addGeneratedLesson(updated);
        set((state) => ({
          lessonOverrides: { ...state.lessonOverrides, [lesson.id]: updated },
          auditLog: audit(state, status === "published" ? "lesson published" : status === "archived" ? "lesson archived" : "lesson status changed", "lesson", lesson.id, `${lesson.title} changed to ${status}.`),
        }));
      },
      duplicateLesson: (lesson) => {
        const duplicate: LessonPackage = {
          ...lesson,
          id: `${lesson.id}_copy_${get().auditLog.length + 1}`,
          title: `${lesson.title} (Copy)`,
          japaneseTitle: `${lesson.japaneseTitle}（コピー）`,
          status: "draft",
          story: lesson.story.map((line, index) => ({ ...line, id: `${lesson.id}_copy_story_${index + 1}` })),
        };
        get().saveLesson(duplicate, "lesson duplicated");
        return duplicate;
      },
      deleteLesson: (lesson) => {
        if (lesson.source === "user_generated") useAppStore.getState().removeGeneratedLesson(lesson.id);
        set((state) => {
          const overrides = { ...state.lessonOverrides };
          delete overrides[lesson.id];
          return {
            lessonOverrides: overrides,
            deletedLessonIds: [...new Set([...state.deletedLessonIds, lesson.id])],
            auditLog: audit(state, "lesson deleted", "lesson", lesson.id, `${lesson.title} removed from mock content.`),
          };
        });
      },
      bulkUpdateLessons: (lessons, status) => {
        lessons.forEach((lesson) => {
          if (lesson.source === "user_generated") useAppStore.getState().addGeneratedLesson({ ...lesson, status });
        });
        set((state) => ({
          lessonOverrides: lessons.reduce((result, lesson) => ({ ...result, [lesson.id]: { ...lesson, status } }), state.lessonOverrides),
          auditLog: audit(state, "lesson bulk status changed", "lesson", lessons.map((lesson) => lesson.id).join(","), `${lessons.length} lessons changed to ${status}.`),
        }));
      },
      setValidationStatus: (lessonId, status, note) =>
        set((state) => {
          const existing = state.validations[lessonId];
          if (!existing) return state;
          const outcome = status === "rejected" || status === "failed" ? "failed" : status === "approved" || status === "published" ? "passed" : "warning";
          const updated: LessonValidation = {
            ...existing,
            status,
            history: [{
              id: `history_${lessonId}_${existing.history.length + 1}`,
              timestamp: timestamp(),
              admin: state.session.displayName,
              score: existing.score,
              outcome,
              note,
            }, ...existing.history],
          };
          const lesson = state.lessonOverrides[lessonId] ?? useAppStore.getState().generatedLessons.find((item) => item.id === lessonId);
          if (lesson && status === "published") {
            const published = { ...lesson, status: "published" as const };
            if (published.source === "user_generated") useAppStore.getState().addGeneratedLesson(published);
          }
          return {
            validations: { ...state.validations, [lessonId]: updated },
            lessonOverrides: lesson && status === "published" ? { ...state.lessonOverrides, [lessonId]: { ...lesson, status: "published" } } : state.lessonOverrides,
            auditLog: audit(state, status === "rejected" ? "lesson rejected" : status === "published" ? "lesson published" : "validation updated", "validation", lessonId, note),
          };
        }),
      regenerateLessonSection: (lessonId, section) =>
        set((state) => {
          const existing = state.validations[lessonId];
          if (!existing) return state;
          return {
            validations: {
              ...state.validations,
              [lessonId]: {
                ...existing,
                status: "needs human review",
                score: Math.min(98, existing.score + 3),
                warnings: existing.warnings.filter((warning) => !warning.toLowerCase().includes(section.toLowerCase())),
                history: [{
                  id: `history_${lessonId}_${existing.history.length + 1}`,
                  timestamp: timestamp(),
                  admin: state.session.displayName,
                  score: Math.min(98, existing.score + 3),
                  outcome: "warning",
                  note: `${section} regenerated with deterministic mock content.`,
                }, ...existing.history],
              },
            },
            auditLog: audit(state, "lesson section regenerated", "validation", lessonId, `${section} regenerated.`),
          };
        }),
      ensureValidation: (lesson) =>
        set((state) => state.validations[lesson.id]
          ? state
          : { validations: { ...state.validations, [lesson.id]: createValidation(lesson) } }),
      saveCurriculumItem: (item) =>
        set((state) => ({
          curriculumItems: [item, ...state.curriculumItems.filter((current) => current.id !== item.id)].sort((a, b) => a.order - b.order),
          auditLog: audit(state, "curriculum changed", "curriculum", item.id, `${item.label} saved.`),
        })),
      saveGrammar: (record) =>
        set((state) => ({
          grammarRecords: [record, ...state.grammarRecords.filter((item) => item.id !== record.id)],
          auditLog: audit(state, "grammar edited", "grammar", record.id, `${record.pattern} saved.`),
        })),
      saveKanji: (record) =>
        set((state) => ({
          kanjiRecords: [record, ...state.kanjiRecords.filter((item) => item.id !== record.id)],
          auditLog: audit(state, "kanji edited", "kanji", record.id, `${record.character} saved.`),
        })),
      saveVocabulary: (record) =>
        set((state) => ({
          vocabularyRecords: [record, ...state.vocabularyRecords.filter((item) => item.id !== record.id)],
          auditLog: audit(state, "vocabulary edited", "vocabulary", record.id, `${record.writtenForm} saved.`),
        })),
      saveImage: (asset) =>
        set((state) => ({
          imageAssets: [asset, ...state.imageAssets.filter((item) => item.id !== asset.id)],
          auditLog: audit(state, asset.status === "archived" ? "asset archived" : "image metadata edited", "image", asset.id, asset.description || "Image metadata updated."),
        })),
      saveAudio: (asset) =>
        set((state) => ({
          audioAssets: [asset, ...state.audioAssets.filter((item) => item.id !== asset.id)],
          auditLog: audit(state, asset.status === "archived" ? "asset archived" : "audio metadata edited", "audio", asset.id, asset.japaneseText),
        })),
      updateUser: (user, action) =>
        set((state) => ({
          users: [user, ...state.users.filter((item) => item.id !== user.id)],
          auditLog: audit(state, action, "user", user.id, `${user.displayName}: ${action}.`),
        })),
      changeUserPlan: (userId, plan) => {
        if (userId === useAppStore.getState().user.id) useAppStore.getState().setSubscription(plan);
        set((state) => ({
          users: state.users.map((user) => user.id === userId ? { ...user, subscription: plan } : user),
          subscriptions: state.subscriptions.map((record) => record.userId === userId ? { ...record, plan, status: "active", paymentStatus: plan === "premium" ? "paid" : "not applicable" } : record),
          auditLog: audit(state, "user plan changed", "user", userId, `Plan changed to ${plan}.`),
        }));
      },
      resetUserProgress: (userId) => {
        if (userId === useAppStore.getState().user.id) useAppStore.getState().resetProgress();
        set((state) => ({
          users: state.users.map((user) => user.id === userId ? { ...user, xp: 0, streak: 0, lessonsCompleted: 0 } : user),
          auditLog: audit(state, "user progress reset", "user", userId, "Mock learner progress reset."),
        }));
      },
      deleteUser: (userId) =>
        set((state) => ({
          users: state.users.map((user) => user.id === userId ? { ...user, status: "deleted" } : user),
          auditLog: audit(state, "user deleted", "user", userId, "Mock user marked deleted."),
        })),
      updateSubscription: (recordId, status, plan) =>
        set((state) => {
          const record = state.subscriptions.find((item) => item.id === recordId);
          if (!record) return state;
          const nextPlan = plan ?? record.plan;
          if (record.userId === useAppStore.getState().user.id) {
            if (status === "cancelled") useAppStore.getState().cancelSubscription();
            else useAppStore.getState().setSubscription(nextPlan, record.billingInterval);
          }
          return {
            subscriptions: state.subscriptions.map((item) => item.id === recordId ? { ...item, status, plan: nextPlan, paymentStatus: status === "failed" ? "failed" : nextPlan === "premium" ? "paid" : "not applicable" } : item),
            users: state.users.map((user) => user.id === record.userId ? { ...user, subscription: nextPlan } : user),
            auditLog: audit(state, "subscription changed", "subscription", recordId, `${record.userName}: ${nextPlan}, ${status}.`),
          };
        }),
      updateReport: (reportId, status, priority = "medium", note) =>
        set((state) => {
          const existing = state.reportStates[reportId];
          const next: AdminLessonReportState = {
            reportId,
            status,
            priority,
            assignedTo: existing?.assignedTo ?? state.session.displayName,
            internalNotes: note ? [note, ...(existing?.internalNotes ?? [])] : existing?.internalNotes ?? [],
            userNotified: existing?.userNotified ?? false,
            updatedAt: timestamp(),
          };
          return {
            reportStates: { ...state.reportStates, [reportId]: next },
            auditLog: audit(state, status === "fixed" ? "report resolved" : "report status changed", "report", reportId, `Report changed to ${status}.`),
          };
        }),
      notifyReportUser: (reportId) =>
        set((state) => {
          const existing = state.reportStates[reportId];
          if (!existing) return state;
          return {
            reportStates: { ...state.reportStates, [reportId]: { ...existing, userNotified: true, updatedAt: timestamp() } },
            auditLog: audit(state, "report user notified", "report", reportId, "Mock notification recorded."),
          };
        }),
      updateSupportTicket: (requestId, status, priority = "medium", note) =>
        set((state) => {
          const existing = state.supportTickets[requestId];
          const next: SupportTicket = {
            requestId,
            status,
            priority,
            assignedTo: existing?.assignedTo ?? state.session.displayName,
            internalNotes: note ? [note, ...(existing?.internalNotes ?? [])] : existing?.internalNotes ?? [],
            conversation: existing?.conversation ?? [],
            updatedAt: timestamp(),
          };
          return {
            supportTickets: { ...state.supportTickets, [requestId]: next },
            auditLog: audit(state, "support status changed", "support", requestId, `Support request changed to ${status}.`),
          };
        }),
      replyToSupportTicket: (requestId, message) =>
        set((state) => {
          const existing = state.supportTickets[requestId] ?? {
            requestId,
            status: "open" as const,
            priority: "medium" as const,
            assignedTo: state.session.displayName,
            internalNotes: [],
            conversation: [],
            updatedAt: timestamp(),
          };
          return {
            supportTickets: {
              ...state.supportTickets,
              [requestId]: {
                ...existing,
                status: "waiting for user",
                conversation: [...existing.conversation, { id: `message_${Date.now()}`, author: "admin", message, createdAt: timestamp() }],
                updatedAt: timestamp(),
              },
            },
            auditLog: audit(state, "support request answered", "support", requestId, "Mock admin reply added."),
          };
        }),
      updateSettings: (next) =>
        set((state) => ({
          settings: { ...state.settings, ...next },
          auditLog: audit(state, "admin settings changed", "settings", "global", "Admin defaults updated."),
        })),
      toggleFeatureFlag: (flag) =>
        set((state) => ({
          settings: {
            ...state.settings,
            featureFlags: { ...state.settings.featureFlags, [flag]: !state.settings.featureFlags[flag] },
          },
          auditLog: audit(state, "feature flag changed", "settings", flag, `${flag} toggled.`),
        })),
      rebuildIndexes: () =>
        set((state) => ({
          indexRebuiltAt: timestamp(),
          auditLog: audit(state, "mock indexes rebuilt", "data", "indexes", "Lesson and asset indexes rebuilt."),
        })),
      clearGeneratedContent: () => {
        const generated = useAppStore.getState().generatedLessons;
        generated.forEach((lesson) => useAppStore.getState().removeGeneratedLesson(lesson.id));
        set((state) => {
          const generatedIds = new Set([
            ...generated.map((lesson) => lesson.id),
            ...Object.values(state.lessonOverrides).filter((lesson) => lesson.source === "generated" || lesson.source === "user_generated").map((lesson) => lesson.id),
          ]);
          return {
            lessonOverrides: Object.fromEntries(Object.entries(state.lessonOverrides).filter(([id]) => !generatedIds.has(id))),
            validations: Object.fromEntries(Object.entries(state.validations).filter(([id]) => !generatedIds.has(id))),
            deletedLessonIds: [...new Set([...state.deletedLessonIds, ...generatedIds])],
            auditLog: audit(state, "generated content cleared", "data", "generated", `${generatedIds.size} generated records removed.`),
          };
        });
      },
      resetAdminData: () => set((state) => ({
        ...initialState,
        session: state.session,
        hasHydrated: state.hasHydrated,
        auditLog: audit(state, "admin mock data reset", "data", "admin-store", "Admin data returned to deterministic defaults."),
      })),
      addAudit: (action, entityType, entityId, summary) =>
        set((state) => ({ auditLog: audit(state, action, entityType, entityId, summary) })),
    }),
    {
      name: "aiko-admin-state",
      version: 2,
      storage: createJSONStorage(() => adminSafeStorage),
      migrate: migrateAdminStore,
      merge: (persisted, current) => {
        const saved = persisted as Partial<AdminStoreState>;
        return {
          ...current,
          ...saved,
          session: { ...current.session, ...saved.session },
          lessonOverrides: { ...current.lessonOverrides, ...saved.lessonOverrides },
          validations: { ...current.validations, ...saved.validations },
          settings: {
            ...current.settings,
            ...saved.settings,
            featureFlags: { ...current.settings.featureFlags, ...saved.settings?.featureFlags },
            serviceStatus: { ...current.settings.serviceStatus, ...saved.settings?.serviceStatus },
          },
          deletedLessonIds: saved.deletedLessonIds ?? [],
          lessonStats: saved.lessonStats ?? current.lessonStats,
          curriculumItems: saved.curriculumItems ?? current.curriculumItems,
          grammarRecords: saved.grammarRecords ?? current.grammarRecords,
          kanjiRecords: saved.kanjiRecords ?? current.kanjiRecords,
          vocabularyRecords: saved.vocabularyRecords ?? current.vocabularyRecords,
          imageAssets: saved.imageAssets ?? current.imageAssets,
          audioAssets: saved.audioAssets ?? current.audioAssets,
          users: saved.users ?? current.users,
          subscriptions: saved.subscriptions ?? current.subscriptions,
          reportStates: saved.reportStates ?? {},
          supportTickets: saved.supportTickets ?? {},
          auditLog: saved.auditLog ?? [],
          hasHydrated: false,
        };
      },
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    },
  ),
);
