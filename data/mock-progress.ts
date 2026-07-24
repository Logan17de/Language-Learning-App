import type { LearnerProgress } from "@/types/progress";

export const mockProgress: LearnerProgress = {
  weeklyActivity: [
    { day: "M", minutes: 28, goal: 30 },
    { day: "T", minutes: 34, goal: 30 },
    { day: "W", minutes: 20, goal: 30 },
    { day: "T", minutes: 42, goal: 30 },
    { day: "F", minutes: 18, goal: 30 },
    { day: "S", minutes: 0, goal: 30 },
    { day: "S", minutes: 0, goal: 30 },
  ],
  weakKanji: [
    { term: "改札", reading: "かいさつ", meaning: "ticket gate", mastery: 42 },
    { term: "働", reading: "はたら", meaning: "work", mastery: 58 },
    { term: "場", reading: "ば", meaning: "place", mastery: 64 },
  ],
  weakVocabulary: [
    { term: "一緒に", reading: "いっしょに", meaning: "together", mastery: 51 },
    { term: "改札", reading: "かいさつ", meaning: "ticket gate", mastery: 42 },
  ],
  grammarToReview: [
    { term: "〜ので", meaning: "because / since", mastery: 61 },
    { term: "〜てしまう", meaning: "finish / regretfully", mastery: 54 },
  ],
  recentLessons: [
    { lessonId: "lesson_n4_cafe_002", title: "Meeting at a Café", completedAt: "Yesterday", score: 88 },
    { lessonId: "lesson_n4_shopping_003", title: "Finding the Right Size", completedAt: "3 days ago", score: 82 },
  ],
  completedLessonIds: ["lesson_n4_cafe_002", "lesson_n4_shopping_003"],
  lessonProgress: {},
  kanjiRecognition: 64,
  pronunciation: 58,
  grammarUnderstanding: 67,
  grammarProduction: 51,
  reviewQueue: [
    { id: "review_kaisatsu", type: "vocabulary", term: "改札", reading: "かいさつ", meaning: "ticket gate", dueLabel: "Today", confidence: 42, pronunciation: 55, lastReviewed: "Yesterday", reason: "Paused before this word", overdue: false },
    { id: "review_node", type: "grammar", term: "〜ので", meaning: "because / since", dueLabel: "Today", confidence: 61, lastReviewed: "3 days ago", reason: "Production mistake", overdue: true },
    { id: "review_eki", type: "kanji", term: "駅", reading: "えき", meaning: "station", dueLabel: "Tomorrow", confidence: 68, pronunciation: 72, lastReviewed: "Today", reason: "Scheduled spacing" },
    { id: "review_listen_gate", type: "listening", term: "改札で会います", meaning: "Meet at the ticket gate", dueLabel: "Today", confidence: 58, lastReviewed: "Yesterday", reason: "Three audio replays" },
    { id: "review_speaking_nagara", type: "speaking", term: "〜ながら", meaning: "while doing", dueLabel: "Today", confidence: 54, pronunciation: 64, lastReviewed: "Yesterday", reason: "Missed particle in speaking" },
  ],
  longestStreak: 18,
  totalStudyMinutes: 1260,
  listeningConfidence: 62,
  speakingConfidence: 59,
  reviewScores: [72, 80, 84],
  achievements: [
    { id: "first_lesson", title: "First Lesson", description: "Complete your first structured lesson.", earned: true, earnedAt: "2026-04-12", progress: 1, target: 1 },
    { id: "seven_day", title: "Seven-Day Streak", description: "Study for seven days in a row.", earned: true, earnedAt: "2026-04-20", progress: 7, target: 7 },
    { id: "kanji_100", title: "100 Kanji Reviews", description: "Review kanji one hundred times.", earned: false, progress: 68, target: 100 },
    { id: "grammar_explorer", title: "Grammar Explorer", description: "Practice twenty grammar patterns.", earned: false, progress: 12, target: 20 },
    { id: "speaking_starter", title: "Speaking Starter", description: "Complete your first speaking activity.", earned: true, earnedAt: "2026-05-02", progress: 1, target: 1 },
  ],
};
