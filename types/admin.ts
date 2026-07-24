import type { JLPTLevel, LessonPackage } from "@/types/lesson";
import type { SubscriptionPlan } from "@/types/app-preferences";

export interface AdminSession {
  authenticated: boolean;
  email: string;
  displayName: string;
  role: string;
  signedInAt?: string;
}

export interface AdminDashboardMetrics {
  totalUsers: number;
  dailyActiveUsers: number;
  premiumUsers: number;
  lessonsPublished: number;
  generatedAwaitingValidation: number;
  reportsAwaitingReview: number;
  openSupportRequests: number;
  lessonsCompletedToday: number;
  averageLessonScore: number;
  estimatedAiCost: number;
  storageUsageGb: number;
  failedGenerationCount: number;
}

export type ValidationSeverity = "passed" | "warning" | "failed";
export type ValidationCategory =
  | "Schema"
  | "Curriculum"
  | "Content alignment"
  | "Question quality"
  | "Language quality"
  | "Safety and quality";

export interface ValidationCheck {
  id: string;
  category: ValidationCategory;
  label: string;
  severity: ValidationSeverity;
  detail: string;
}

export interface ValidationHistory {
  id: string;
  timestamp: string;
  admin: string;
  score: number;
  outcome: "passed" | "warning" | "failed";
  note: string;
}

export type GeneratedValidationStatus =
  | "generated"
  | "checking"
  | "failed"
  | "needs human review"
  | "approved"
  | "rejected"
  | "published";

export interface LessonValidation {
  lessonId: string;
  requestedTopic: string;
  requester: string;
  sourceLessonId?: string;
  generatedAt: string;
  generationSeconds: number;
  score: number;
  status: GeneratedValidationStatus;
  warnings: string[];
  checks: ValidationCheck[];
  history: ValidationHistory[];
}

export interface LessonAdminStats {
  lessonId: string;
  completionCount: number;
  averageScore: number;
  reportCount: number;
  updatedAt: string;
  completionRate: number;
  failureRate: number;
}

export type CurriculumItemType = "grammar" | "kanji" | "vocabulary";

export interface CurriculumItem {
  id: string;
  level: JLPTLevel;
  type: CurriculumItemType;
  label: string;
  order: number;
  required: boolean;
  prerequisites: string[];
  lessonIds: string[];
}

export interface CurriculumLevel {
  level: JLPTLevel;
  title: string;
  grammarTotal: number;
  kanjiTotal: number;
  vocabularyTotal: number;
  lessonCoverage: number;
  uncoveredConcepts: number;
  duplicateCoverage: number;
  prerequisiteGaps: number;
  sequence: string[];
}

export interface GrammarRecord {
  id: string;
  pattern: string;
  level: JLPTLevel;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  exampleSentences: string[];
  commonMistakes: string[];
  prerequisites: string[];
  similarGrammar: string[];
  contrastGrammar: string[];
  lessonUsageCount: number;
  archived: boolean;
}

export interface KanjiRecord {
  id: string;
  character: string;
  level: JLPTLevel;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
  prerequisiteKanji: string[];
  lessonUsageCount: number;
  archived: boolean;
}

export interface VocabularyRecord {
  id: string;
  writtenForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  level: JLPTLevel;
  tags: string[];
  exampleSentence: string;
  linkedKanji: string[];
  lessonUsageCount: number;
  archived: boolean;
}

export type AssetStatus = "active" | "review" | "reported" | "archived" | "low quality" | "inappropriate";

export interface ImageAsset {
  id: string;
  description: string;
  topicTags: string[];
  visibleObjects: string[];
  vocabularyTags: string[];
  grammarCompatibility: string[];
  level: JLPTLevel;
  qualityScore: number;
  usageCount: number;
  linkedLessonIds: string[];
  creationSource: "curated" | "generated" | "placeholder";
  status: AssetStatus;
  globalUsageCount: number;
  learnerFreshnessScore: number;
}

export interface AudioAsset {
  id: string;
  japaneseText: string;
  voice: string;
  speakingStyle: "neutral" | "friendly" | "formal";
  durationSeconds: number;
  playbackSpeed: number;
  linkedLessonIds: string[];
  status: AssetStatus;
  reportCount: number;
}

export type AdminUserStatus = "active" | "suspended" | "deleted";

export interface AdminUserRecord {
  id: string;
  displayName: string;
  email: string;
  level: JLPTLevel;
  subscription: SubscriptionPlan;
  joinDate: string;
  lastActive: string;
  streak: number;
  lessonsCompleted: number;
  xp: number;
  supportRequestCount: number;
  reportCount: number;
  status: AdminUserStatus;
}

export type SubscriptionRecordStatus = "active" | "cancelled" | "trial" | "failed";

export interface SubscriptionRecord {
  id: string;
  userId: string;
  userName: string;
  plan: SubscriptionPlan;
  billingInterval: "monthly" | "annual";
  status: SubscriptionRecordStatus;
  startDate: string;
  renewalDate?: string;
  cancellationDate?: string;
  paymentStatus: "paid" | "trial" | "failed" | "not applicable";
}

export type LessonReportStatus = "new" | "investigating" | "confirmed" | "fixed" | "rejected" | "closed";
export type Priority = "low" | "medium" | "high" | "urgent";

export interface AdminLessonReportState {
  reportId: string;
  status: LessonReportStatus;
  priority: Priority;
  assignedTo: string;
  internalNotes: string[];
  userNotified: boolean;
  updatedAt: string;
}

export type SupportTicketStatus = "new" | "open" | "waiting for user" | "resolved" | "closed";

export interface SupportMessage {
  id: string;
  author: "user" | "admin";
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  requestId: string;
  status: SupportTicketStatus;
  priority: Priority;
  assignedTo: string;
  internalNotes: string[];
  conversation: SupportMessage[];
  updatedAt: string;
}

export interface AnalyticsPoint {
  label: string;
  value: number;
}

export interface AnalyticsSnapshot {
  capturedAt: string;
  usage: Record<string, number>;
  retention: Record<string, number>;
  learning: Record<string, number>;
  content: Record<string, number>;
  conversion: Record<string, number>;
  dailySeries: AnalyticsPoint[];
  cohortSeries: AnalyticsPoint[];
}

export type CostCategory =
  | "lesson planning"
  | "lesson creation"
  | "lesson checking"
  | "image generation"
  | "audio generation"
  | "speech recognition"
  | "speaking evaluation"
  | "support AI"
  | "storage"
  | "email";

export interface CostRecord {
  id: string;
  category: CostCategory;
  today: number;
  currentMonth: number;
  unit: string;
  units: number;
}

export type AuditEntityType =
  | "lesson"
  | "validation"
  | "curriculum"
  | "grammar"
  | "kanji"
  | "vocabulary"
  | "image"
  | "audio"
  | "user"
  | "subscription"
  | "report"
  | "support"
  | "settings"
  | "data";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  adminUser: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  summary: string;
}

export type FeatureFlag =
  | "customTopicLessons"
  | "speakingPractice"
  | "readingAnalysis"
  | "imageGeneration"
  | "audioGeneration"
  | "premiumGating"
  | "maintenanceMode";

export type MockServiceName =
  | "lesson creation"
  | "validation"
  | "speech"
  | "audio"
  | "image"
  | "email"
  | "payments";

export interface AdminSettings {
  defaultLessonLength: 15 | 30 | 45 | 60;
  allowedLevels: JLPTLevel[];
  generationLimitPerDay: number;
  validationThreshold: number;
  publishBehavior: "manual" | "after approval";
  featureFlags: Record<FeatureFlag, boolean>;
  serviceStatus: Record<MockServiceName, "operational" | "degraded" | "offline">;
}

export interface AdminLessonDraft {
  lesson: LessonPackage;
  valid: boolean;
  errors: Record<string, string>;
}
