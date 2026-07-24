import type {
  AdminLessonReportState,
  AdminSession,
  AdminSettings,
  AdminUserRecord,
  AudioAsset,
  AuditEntityType,
  AuditLogEntry,
  CurriculumItem,
  GeneratedValidationStatus,
  GrammarRecord,
  ImageAsset,
  KanjiRecord,
  LessonAdminStats,
  LessonReportStatus,
  LessonValidation,
  Priority,
  SubscriptionRecord,
  SubscriptionRecordStatus,
  SupportTicket,
  SupportTicketStatus,
  VocabularyRecord,
} from "@/types/admin";
import type { LessonPackage, LessonStatus } from "@/types/lesson";

export interface AdminStoreState {
  hasHydrated: boolean;
  storageAvailable: boolean;
  session: AdminSession;
  lessonOverrides: Record<string, LessonPackage>;
  deletedLessonIds: string[];
  lessonStats: LessonAdminStats[];
  validations: Record<string, LessonValidation>;
  curriculumItems: CurriculumItem[];
  grammarRecords: GrammarRecord[];
  kanjiRecords: KanjiRecord[];
  vocabularyRecords: VocabularyRecord[];
  imageAssets: ImageAsset[];
  audioAssets: AudioAsset[];
  users: AdminUserRecord[];
  subscriptions: SubscriptionRecord[];
  reportStates: Record<string, AdminLessonReportState>;
  supportTickets: Record<string, SupportTicket>;
  auditLog: AuditLogEntry[];
  settings: AdminSettings;
  indexRebuiltAt?: string;
  setHasHydrated: (value: boolean) => void;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  saveLesson: (lesson: LessonPackage, action?: string) => void;
  updateLessonStatus: (lesson: LessonPackage, status: LessonStatus) => void;
  duplicateLesson: (lesson: LessonPackage) => LessonPackage;
  deleteLesson: (lesson: LessonPackage) => void;
  bulkUpdateLessons: (lessons: LessonPackage[], status: LessonStatus) => void;
  setValidationStatus: (lessonId: string, status: GeneratedValidationStatus, note: string) => void;
  regenerateLessonSection: (lessonId: string, section: string) => void;
  ensureValidation: (lesson: LessonPackage) => void;
  saveCurriculumItem: (item: CurriculumItem) => void;
  saveGrammar: (record: GrammarRecord) => void;
  saveKanji: (record: KanjiRecord) => void;
  saveVocabulary: (record: VocabularyRecord) => void;
  saveImage: (asset: ImageAsset) => void;
  saveAudio: (asset: AudioAsset) => void;
  updateUser: (user: AdminUserRecord, action: string) => void;
  changeUserPlan: (userId: string, plan: AdminUserRecord["subscription"]) => void;
  resetUserProgress: (userId: string) => void;
  deleteUser: (userId: string) => void;
  updateSubscription: (recordId: string, status: SubscriptionRecordStatus, plan?: SubscriptionRecord["plan"]) => void;
  updateReport: (reportId: string, status: LessonReportStatus, priority?: Priority, note?: string) => void;
  notifyReportUser: (reportId: string) => void;
  updateSupportTicket: (requestId: string, status: SupportTicketStatus, priority?: Priority, note?: string) => void;
  replyToSupportTicket: (requestId: string, message: string) => void;
  updateSettings: (settings: Partial<AdminSettings>) => void;
  toggleFeatureFlag: (flag: keyof AdminSettings["featureFlags"]) => void;
  rebuildIndexes: () => void;
  clearGeneratedContent: () => void;
  resetAdminData: () => void;
  addAudit: (action: string, entityType: AuditEntityType, entityId: string, summary: string) => void;
}
