import { commuteLesson } from "@/data/mock-lessons";
import type {
  AdminDashboardMetrics,
  AdminLessonReportState,
  AdminSettings,
  AdminUserRecord,
  AnalyticsSnapshot,
  AudioAsset,
  CostRecord,
  CurriculumItem,
  CurriculumLevel,
  GrammarRecord,
  ImageAsset,
  KanjiRecord,
  LessonAdminStats,
  LessonValidation,
  SubscriptionRecord,
  SupportTicket,
  VocabularyRecord,
} from "@/types/admin";
import type { LessonPackage } from "@/types/lesson";
import { buildValidationChecks } from "@/lib/generated-validation";

export const mockAdminCredentials = {
  email: "admin@aiko.local",
  password: "admin123",
} as const;

const phases = commuteLesson.phases;

export const initialLessonOverrides: Record<string, LessonPackage> = {
  lesson_generated_business_008: {
    ...commuteLesson,
    id: "lesson_generated_business_008",
    title: "Welcoming a Business Visitor",
    japaneseTitle: "来客を迎える",
    topic: "Work",
    level: "N3",
    durationMinutes: 30,
    source: "generated",
    status: "draft",
    summary: "Welcome a visitor, confirm an appointment, and guide them to a meeting room.",
    tags: ["business", "reception", "generated"],
  },
  lesson_generated_farming_009: {
    ...commuteLesson,
    id: "lesson_generated_farming_009",
    title: "Smart Farming Conversation",
    japaneseTitle: "スマート農業について話す",
    topic: "Technology",
    level: "N3",
    durationMinutes: 30,
    source: "generated",
    status: "rejected",
    summary: "Discuss sensors and daily work on a modern farm.",
    tags: ["agriculture", "technology", "generated"],
  },
  lesson_draft_neighbor_010: {
    ...commuteLesson,
    id: "lesson_draft_neighbor_010",
    title: "Meeting a New Neighbor",
    japaneseTitle: "新しい隣人に会う",
    topic: "Daily life",
    level: "N5",
    durationMinutes: 15,
    source: "curated_seed",
    status: "draft",
    summary: "Introduce yourself politely to a new neighbor.",
    tags: ["neighbor", "introduction", "draft"],
  },
  lesson_malformed_011: {
    ...commuteLesson,
    id: "lesson_malformed_011",
    title: "Incomplete Restaurant Package",
    japaneseTitle: "未完成のレストラン教材",
    topic: "Food",
    level: "N4",
    durationMinutes: 20,
    source: "generated",
    status: "malformed",
    summary: "A deliberately incomplete package used to exercise admin error states.",
    listeningExercises: [],
    reviewQuestions: [],
    answerKeys: [],
    phases,
    tags: ["malformed", "restaurant"],
  },
};

export const initialLessonStats: LessonAdminStats[] = [
  { lessonId: "lesson_n4_commute_001", completionCount: 1248, averageScore: 84, reportCount: 3, updatedAt: "2026-07-23", completionRate: 82, failureRate: 8 },
  { lessonId: "lesson_n4_cafe_002", completionCount: 936, averageScore: 88, reportCount: 1, updatedAt: "2026-07-22", completionRate: 91, failureRate: 4 },
  { lessonId: "lesson_n4_shopping_003", completionCount: 712, averageScore: 81, reportCount: 2, updatedAt: "2026-07-20", completionRate: 74, failureRate: 13 },
  { lessonId: "lesson_n5_train_004", completionCount: 1642, averageScore: 86, reportCount: 4, updatedAt: "2026-07-21", completionRate: 89, failureRate: 6 },
  { lessonId: "lesson_n3_it_005", completionCount: 408, averageScore: 73, reportCount: 6, updatedAt: "2026-07-24", completionRate: 61, failureRate: 22 },
  { lessonId: "lesson_n4_hospital_006", completionCount: 584, averageScore: 79, reportCount: 2, updatedAt: "2026-07-18", completionRate: 77, failureRate: 11 },
  { lessonId: "lesson_n3_interview_007", completionCount: 328, averageScore: 76, reportCount: 5, updatedAt: "2026-07-19", completionRate: 58, failureRate: 24 },
  { lessonId: "lesson_generated_business_008", completionCount: 0, averageScore: 0, reportCount: 0, updatedAt: "2026-07-24", completionRate: 0, failureRate: 0 },
  { lessonId: "lesson_generated_farming_009", completionCount: 0, averageScore: 0, reportCount: 0, updatedAt: "2026-07-23", completionRate: 0, failureRate: 0 },
  { lessonId: "lesson_draft_neighbor_010", completionCount: 0, averageScore: 0, reportCount: 0, updatedAt: "2026-07-22", completionRate: 0, failureRate: 0 },
  { lessonId: "lesson_malformed_011", completionCount: 0, averageScore: 0, reportCount: 2, updatedAt: "2026-07-24", completionRate: 0, failureRate: 100 },
];

export const initialValidations: Record<string, LessonValidation> = {
  lesson_generated_business_008: {
    lessonId: "lesson_generated_business_008",
    requestedTopic: "welcoming a business visitor",
    requester: "Mika S.",
    sourceLessonId: "lesson_n3_interview_007",
    generatedAt: "2026-07-24 09:42",
    generationSeconds: 18,
    score: 91,
    status: "needs human review",
    warnings: ["Formal register should be reviewed in the final dialogue."],
    checks: buildValidationChecks({ language_natural: "warning", language_register: "warning" }),
    history: [{ id: "vh_001", timestamp: "2026-07-24 09:43", admin: "System validator", score: 91, outcome: "warning", note: "Schema passed; one language warning." }],
  },
  lesson_generated_farming_009: {
    lessonId: "lesson_generated_farming_009",
    requestedTopic: "agriculture technology",
    requester: "Hana",
    generatedAt: "2026-07-23 16:08",
    generationSeconds: 23,
    score: 68,
    status: "rejected",
    warnings: ["Vocabulary exceeds N3 target.", "One review answer is ambiguous."],
    checks: buildValidationChecks({ curriculum_level: "failed", curriculum_vocabulary: "failed", question_unique: "failed", question_ambiguity: "warning", language_natural: "warning" }),
    history: [{ id: "vh_002", timestamp: "2026-07-23 16:10", admin: "Aiko Admin", score: 68, outcome: "failed", note: "Rejected pending curriculum corrections." }],
  },
  lesson_malformed_011: {
    lessonId: "lesson_malformed_011",
    requestedTopic: "restaurant reservation",
    requester: "System fixture",
    generatedAt: "2026-07-24 08:30",
    generationSeconds: 4,
    score: 35,
    status: "failed",
    warnings: ["Listening, review questions, and answer keys are missing."],
    checks: buildValidationChecks({ schema_required: "warning", schema_answers: "failed", schema_phases: "failed", alignment_story: "failed", alignment_listening: "failed", alignment_review: "failed" }),
    history: [{ id: "vh_003", timestamp: "2026-07-24 08:31", admin: "System validator", score: 35, outcome: "failed", note: "Malformed package quarantined." }],
  },
};

export const curriculumLevels: CurriculumLevel[] = [
  { level: "N5", title: "N5 Foundation", grammarTotal: 82, kanjiTotal: 103, vocabularyTotal: 800, lessonCoverage: 71, uncoveredConcepts: 18, duplicateCoverage: 4, prerequisiteGaps: 2, sequence: ["Basic particles", "Verb forms", "Adjective forms", "Requests", "Comparisons"] },
  { level: "N4", title: "N4 Everyday independence", grammarTotal: 165, kanjiTotal: 181, vocabularyTotal: 1500, lessonCoverage: 63, uncoveredConcepts: 31, duplicateCoverage: 7, prerequisiteGaps: 5, sequence: ["Connected actions", "Reasons", "Experience", "Conditions", "Reported speech"] },
  { level: "N3", title: "N3 Connected expression", grammarTotal: 240, kanjiTotal: 370, vocabularyTotal: 3750, lessonCoverage: 48, uncoveredConcepts: 74, duplicateCoverage: 9, prerequisiteGaps: 12, sequence: ["Nuance", "Formal speech", "Complex conditions", "Written connectors", "Abstract topics"] },
  { level: "N2", title: "N2 Advanced fluency", grammarTotal: 210, kanjiTotal: 374, vocabularyTotal: 6000, lessonCoverage: 24, uncoveredConcepts: 126, duplicateCoverage: 3, prerequisiteGaps: 18, sequence: ["Formal argument", "News register", "Inference", "Contrast", "Professional nuance"] },
  { level: "N1", title: "N1 Precision", grammarTotal: 190, kanjiTotal: 1136, vocabularyTotal: 10000, lessonCoverage: 9, uncoveredConcepts: 174, duplicateCoverage: 1, prerequisiteGaps: 29, sequence: ["Literary register", "Rhetoric", "Academic Japanese", "Dense compounds", "Native-like nuance"] },
];

export const initialCurriculumItems: CurriculumItem[] = [
  { id: "cur_particle_wa", level: "N5", type: "grammar", label: "は topic particle", order: 1, required: true, prerequisites: [], lessonIds: ["lesson_n5_train_004"] },
  { id: "cur_particle_ga", level: "N5", type: "grammar", label: "が subject particle", order: 2, required: true, prerequisites: ["cur_particle_wa"], lessonIds: ["lesson_n5_train_004"] },
  { id: "cur_nagara", level: "N4", type: "grammar", label: "〜ながら simultaneous actions", order: 8, required: true, prerequisites: ["cur_particle_ga"], lessonIds: ["lesson_n4_commute_001", "lesson_n4_cafe_002"] },
  { id: "cur_youninaru", level: "N4", type: "grammar", label: "〜ようになる change over time", order: 12, required: true, prerequisites: ["cur_nagara"], lessonIds: ["lesson_n4_commute_001"] },
  { id: "cur_eki", level: "N5", type: "kanji", label: "駅 station", order: 14, required: true, prerequisites: [], lessonIds: ["lesson_n5_train_004", "lesson_n4_commute_001"] },
  { id: "cur_kaisatsu", level: "N4", type: "vocabulary", label: "改札 ticket gate", order: 21, required: false, prerequisites: ["cur_eki"], lessonIds: ["lesson_n4_commute_001"] },
];

export const initialGrammar: GrammarRecord[] = [
  { id: "grammar_nagara", pattern: "〜ながら", level: "N4", meaning: "while doing", formation: "Verb stem + ながら", usageNotes: "Two actions by the same subject.", nuance: "The latter action is primary.", exampleSentences: ["音楽を聞きながら歩きます。"], commonMistakes: ["Do not change the subject between clauses."], prerequisites: ["Basic verb stems"], similarGrammar: ["〜つつ"], contrastGrammar: ["〜間に"], lessonUsageCount: 5, archived: false },
  { id: "grammar_youninaru", pattern: "〜ようになる", level: "N4", meaning: "come to / become able to", formation: "Dictionary or potential verb + ようになる", usageNotes: "A gradual change in habit or ability.", nuance: "Emphasizes transition over time.", exampleSentences: ["早く起きられるようになりました。"], commonMistakes: ["Not for a single decision."], prerequisites: ["Potential form"], similarGrammar: ["〜ことになる"], contrastGrammar: ["〜ようにする"], lessonUsageCount: 3, archived: false },
  { id: "grammar_node", pattern: "〜ので", level: "N4", meaning: "because / since", formation: "Plain form + ので", usageNotes: "A softer, explanatory reason.", nuance: "Less direct than から.", exampleSentences: ["雨なので、電車で行きます。"], commonMistakes: ["Use な before ので after nouns and な-adjectives."], prerequisites: ["Plain forms"], similarGrammar: ["〜から"], contrastGrammar: ["〜のに"], lessonUsageCount: 2, archived: false },
];

export const initialKanji: KanjiRecord[] = [
  { id: "kanji_eki", character: "駅", level: "N5", meanings: ["station"], readings: ["えき"], onyomi: ["エキ"], kunyomi: [], exampleWords: ["駅前", "駅員"], strokeCount: 14, prerequisiteKanji: [], lessonUsageCount: 4, archived: false },
  { id: "kanji_hataraku", character: "働", level: "N4", meanings: ["work"], readings: ["はたらく"], onyomi: ["ドウ"], kunyomi: ["はたら"], exampleWords: ["働く", "労働"], strokeCount: 13, prerequisiteKanji: ["人"], lessonUsageCount: 2, archived: false },
  { id: "kanji_ba", character: "場", level: "N4", meanings: ["place", "location"], readings: ["ば", "じょう"], onyomi: ["ジョウ"], kunyomi: ["ば"], exampleWords: ["場所", "会場"], strokeCount: 12, prerequisiteKanji: ["土"], lessonUsageCount: 3, archived: false },
];

export const initialVocabulary: VocabularyRecord[] = [
  { id: "vocab_kaisatsu", writtenForm: "改札", reading: "かいさつ", meaning: "ticket gate", partOfSpeech: "noun", level: "N4", tags: ["station", "travel"], exampleSentence: "改札で友達に会います。", linkedKanji: ["改", "札"], lessonUsageCount: 3, archived: false },
  { id: "vocab_isshoni", writtenForm: "一緒に", reading: "いっしょに", meaning: "together", partOfSpeech: "adverb", level: "N5", tags: ["daily life"], exampleSentence: "一緒に電車に乗りましょう。", linkedKanji: ["一", "緒"], lessonUsageCount: 6, archived: false },
  { id: "vocab_kaisha", writtenForm: "会社", reading: "かいしゃ", meaning: "company", partOfSpeech: "noun", level: "N5", tags: ["work"], exampleSentence: "IT会社で働いています。", linkedKanji: ["会", "社"], lessonUsageCount: 5, archived: false },
];

export const initialImages: ImageAsset[] = [
  { id: "img_commute_station", description: "Morning station entrance with visible ticket gates", topicTags: ["commute", "station"], visibleObjects: ["station sign", "ticket gate", "commuter"], vocabularyTags: ["駅", "改札"], grammarCompatibility: ["〜ながら"], level: "N4", qualityScore: 94, usageCount: 4, linkedLessonIds: ["lesson_n4_commute_001", "lesson_n5_train_004"], creationSource: "curated", status: "active", globalUsageCount: 1280, learnerFreshnessScore: 62 },
  { id: "img_cafe_table", description: "Two friends planning at a café table", topicTags: ["café", "conversation"], visibleObjects: ["menu", "coffee", "table"], vocabularyTags: ["コーヒー", "メニュー"], grammarCompatibility: ["〜予定"], level: "N4", qualityScore: 88, usageCount: 2, linkedLessonIds: ["lesson_n4_cafe_002"], creationSource: "generated", status: "active", globalUsageCount: 642, learnerFreshnessScore: 78 },
  { id: "img_placeholder_farm", description: "", topicTags: ["agriculture"], visibleObjects: [], vocabularyTags: [], grammarCompatibility: [], level: "N3", qualityScore: 42, usageCount: 0, linkedLessonIds: [], creationSource: "placeholder", status: "review", globalUsageCount: 0, learnerFreshnessScore: 100 },
];

export const initialAudio: AudioAsset[] = [
  { id: "audio_commute_01", japaneseText: "改札で田中さんに会います。", voice: "Aoi", speakingStyle: "neutral", durationSeconds: 4.2, playbackSpeed: 1, linkedLessonIds: ["lesson_n4_commute_001"], status: "active", reportCount: 0 },
  { id: "audio_cafe_01", japaneseText: "カフェで待ち合わせをしましょう。", voice: "Ren", speakingStyle: "friendly", durationSeconds: 4.8, playbackSpeed: 1, linkedLessonIds: ["lesson_n4_cafe_002"], status: "active", reportCount: 1 },
  { id: "audio_missing_01", japaneseText: "受付でお待ちください。", voice: "Aoi", speakingStyle: "formal", durationSeconds: 0, playbackSpeed: 1, linkedLessonIds: [], status: "review", reportCount: 0 },
];

export const initialAdminUsers: AdminUserRecord[] = [
  { id: "user_hana_001", displayName: "Hana", email: "hana@example.com", level: "N4", subscription: "free", joinDate: "2026-04-12", lastActive: "2 minutes ago", streak: 12, lessonsCompleted: 18, xp: 2840, supportRequestCount: 0, reportCount: 0, status: "active" },
  { id: "user_mika_002", displayName: "Mika S.", email: "mika@example.com", level: "N3", subscription: "premium", joinDate: "2026-02-08", lastActive: "Today", streak: 29, lessonsCompleted: 54, xp: 8920, supportRequestCount: 2, reportCount: 1, status: "active" },
  { id: "user_liam_003", displayName: "Liam", email: "liam@example.com", level: "N5", subscription: "free", joinDate: "2026-06-18", lastActive: "Yesterday", streak: 4, lessonsCompleted: 6, xp: 760, supportRequestCount: 1, reportCount: 2, status: "active" },
  { id: "user_aya_004", displayName: "Aya", email: "aya@example.com", level: "N2", subscription: "premium", joinDate: "2025-12-02", lastActive: "11 days ago", streak: 0, lessonsCompleted: 81, xp: 14200, supportRequestCount: 3, reportCount: 2, status: "suspended" },
];

export const initialSubscriptions: SubscriptionRecord[] = [
  { id: "sub_hana", userId: "user_hana_001", userName: "Hana", plan: "free", billingInterval: "monthly", status: "active", startDate: "2026-04-12", paymentStatus: "not applicable" },
  { id: "sub_mika", userId: "user_mika_002", userName: "Mika S.", plan: "premium", billingInterval: "annual", status: "active", startDate: "2026-02-08", renewalDate: "2027-02-08", paymentStatus: "paid" },
  { id: "sub_liam", userId: "user_liam_003", userName: "Liam", plan: "premium", billingInterval: "monthly", status: "failed", startDate: "2026-06-18", renewalDate: "2026-07-18", paymentStatus: "failed" },
  { id: "sub_aya", userId: "user_aya_004", userName: "Aya", plan: "free", billingInterval: "monthly", status: "cancelled", startDate: "2025-12-02", cancellationDate: "2026-06-30", paymentStatus: "not applicable" },
];

export const initialReportStates: Record<string, AdminLessonReportState> = {};
export const initialSupportTickets: Record<string, SupportTicket> = {};

export const analyticsSnapshot: AnalyticsSnapshot = {
  capturedAt: "2026-07-24 10:00 JST",
  usage: { "Daily active users": 428, "Weekly active users": 1832, "Monthly active users": 6190, "Lesson starts": 1476, "Lesson completions": 1028, "Review sessions": 714, "Speaking usage": 382, "Reading usage": 806, "Custom-topic requests": 94 },
  retention: { "Day 1": 68, "Day 7": 43, "Day 30": 24 },
  learning: { "Average N5 score": 86, "Average N4 score": 81, "Average N3 score": 76, "Recognition improvement": 12, "Pronunciation improvement": 9, "Grammar improvement": 11, "Review success rate": 78 },
  content: { "Curated lesson uses": 4980, "Generated lesson uses": 1210, "Highest completion": 91, "Lowest completion": 58, "Most reported count": 6, "Work topic demand": 28 },
  conversion: { "Free to premium": 7.8, "Custom-topic gate interactions": 312, "Subscription cancellations": 2.4 },
  dailySeries: [{ label: "Mon", value: 310 }, { label: "Tue", value: 348 }, { label: "Wed", value: 332 }, { label: "Thu", value: 391 }, { label: "Fri", value: 428 }, { label: "Sat", value: 376 }, { label: "Sun", value: 402 }],
  cohortSeries: [{ label: "Apr", value: 31 }, { label: "May", value: 28 }, { label: "Jun", value: 26 }, { label: "Jul", value: 24 }],
};

export const costRecords: CostRecord[] = [
  { id: "cost_plan", category: "lesson planning", today: 3.42, currentMonth: 72.18, unit: "plans", units: 114 },
  { id: "cost_create", category: "lesson creation", today: 8.91, currentMonth: 184.32, unit: "lessons", units: 94 },
  { id: "cost_check", category: "lesson checking", today: 2.28, currentMonth: 49.74, unit: "checks", units: 182 },
  { id: "cost_image", category: "image generation", today: 4.12, currentMonth: 88.4, unit: "images", units: 156 },
  { id: "cost_audio", category: "audio generation", today: 2.83, currentMonth: 61.2, unit: "clips", units: 248 },
  { id: "cost_speech", category: "speech recognition", today: 1.62, currentMonth: 36.8, unit: "minutes", units: 1420 },
  { id: "cost_speaking", category: "speaking evaluation", today: 2.04, currentMonth: 45.16, unit: "attempts", units: 688 },
  { id: "cost_support", category: "support AI", today: 0.48, currentMonth: 10.22, unit: "drafts", units: 84 },
  { id: "cost_storage", category: "storage", today: 0.72, currentMonth: 15.84, unit: "GB", units: 18.4 },
  { id: "cost_email", category: "email", today: 0.11, currentMonth: 2.48, unit: "messages", units: 928 },
];

export const initialAdminSettings: AdminSettings = {
  defaultLessonLength: 30,
  allowedLevels: ["N5", "N4", "N3", "N2", "N1"],
  generationLimitPerDay: 8,
  validationThreshold: 85,
  publishBehavior: "manual",
  featureFlags: {
    customTopicLessons: true,
    speakingPractice: true,
    readingAnalysis: true,
    imageGeneration: true,
    audioGeneration: true,
    premiumGating: true,
    maintenanceMode: false,
  },
  serviceStatus: {
    "lesson creation": "operational",
    validation: "operational",
    speech: "operational",
    audio: "operational",
    image: "degraded",
    email: "operational",
    payments: "operational",
  },
};

export const dashboardMetrics: AdminDashboardMetrics = {
  totalUsers: 6190,
  dailyActiveUsers: 428,
  premiumUsers: 484,
  lessonsPublished: 7,
  generatedAwaitingValidation: 2,
  reportsAwaitingReview: 7,
  openSupportRequests: 12,
  lessonsCompletedToday: 1028,
  averageLessonScore: 82,
  estimatedAiCost: 26.53,
  storageUsageGb: 18.4,
  failedGenerationCount: 3,
};
