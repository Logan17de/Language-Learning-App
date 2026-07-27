export interface WeeklyActivity {
  day: string;
  minutes: number;
  goal: number;
}

export interface MasteryItem {
  term: string;
  reading?: string;
  meaning: string;
  mastery: number;
}

export interface RecentLesson {
  lessonId: string;
  title: string;
  completedAt: string;
  score: number;
  durationMinutes?: number;
}

export interface ReviewQueueItem {
  id: string;
  type: "kanji" | "vocabulary" | "grammar" | "listening" | "speaking";
  term: string;
  dueLabel: string;
  confidence: number;
  reading?: string;
  meaning?: string;
  pronunciation?: number;
  lastReviewed?: string;
  reason?: string;
  overdue?: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  earned: boolean;
  earnedAt?: string;
  progress: number;
  target: number;
}

export interface LearnerProgress {
  levelCompletion: number;
  learnedVocabularyCount: number;
  learnedKanjiCount: number;
  learnedGrammarCount: number;
  weeklyActivity: WeeklyActivity[];
  weakKanji: MasteryItem[];
  weakVocabulary: MasteryItem[];
  grammarToReview: MasteryItem[];
  recentLessons: RecentLesson[];
  completedLessonIds: string[];
  lessonProgress: Record<string, number>;
  kanjiRecognition: number;
  pronunciation: number;
  grammarUnderstanding: number;
  grammarProduction: number;
  reviewQueue: ReviewQueueItem[];
  longestStreak: number;
  totalStudyMinutes: number;
  listeningConfidence: number;
  speakingConfidence: number;
  reviewScores: number[];
  achievements: Achievement[];
}
