import type { LessonPhase } from "@/types/lesson";

export type LessonPhaseId = LessonPhase["id"];
export type ConfidenceLevel = "low" | "medium" | "high";
export type VocabularyMode = "kanji-reading" | "reading-meaning" | "meaning-japanese" | "mixed";
export type GrammarExerciseType = "multiple-choice" | "fill-blank" | "sentence-order" | "natural-sentence";
export type LessonCompletionState = "active" | "completion_pending" | "completed";

export interface LessonActivityProgress {
  phaseId: LessonPhaseId;
  activityIndex: number;
  completed: boolean;
  attempts: number;
}

export interface VocabularyAnswer {
  questionId: string;
  mode: VocabularyMode;
  selectedAnswer: string;
  correct: boolean;
  attempts: number;
}

/** Public runtime shape. Grammar targets and model answers stay server-owned. */
export interface GrammarTranslationQuestion {
  id: string;
  english: string;
}

export interface GrammarAnswer {
  questionId: string;
  type: GrammarExerciseType;
  selectedAnswer: string;
  correct: boolean;
  skill: "understanding" | "production";
  attempts: number;
  feedback?: string;
  suggestion?: string;
  suggestedAnswer?: string;
  revealAnswer?: string;
  validationSource?: "exact_match" | "ai";
}

export type ReadingEventType =
  | "started"
  | "correct-word"
  | "paused-before-word"
  | "skipped-word"
  | "reading-revealed"
  | "meaning-revealed"
  | "pronunciation-issue"
  | "successful-retry"
  | "stopped-at-word"
  | "voice-evaluation";

export interface ReadingEvent {
  id: string;
  type: ReadingEventType;
  term: string;
  confidence: ConfidenceLevel;
  elapsedSeconds: number;
  evaluationAvailable?: boolean;
  speechMatch?: number;
  transcript?: string;
}

export interface ReadingComprehensionAnswer {
  questionId: string;
  response: string;
}

export type ListeningEventType =
  | "play"
  | "replay"
  | "complete"
  | "difficulty-signal"
  | "answer";

export interface ListeningEvent {
  id: string;
  questionId?: string;
  type: ListeningEventType;
  replayCount: number;
  correct?: boolean;
  selectedAnswer?: string;
  elapsedSeconds: number;
}

export interface SpeakingEvent {
  id: string;
  exerciseId?: string;
  mode: "easy" | "medium" | "hard";
  attempt: number;
  evaluationAvailable?: boolean;
  pronunciationConfidence: number;
  grammarAccuracy: number;
  transcript?: string;
  recognizedWords: string[];
  missedWords: string[];
  successfulRetry: boolean;
}

export interface LessonCompletionResult {
  lessonId: string;
  score: number;
  xpGained: number;
  durationMinutes: number;
  weakItems: string[];
  completedAt: string;
}

export interface StoryInteraction {
  id: string;
  lineId: string;
  wordId?: string;
  term?: string;
  type: "audio-played" | "word-opened" | "reading-revealed" | "meaning-revealed";
  scoreDelta?: number;
  meaningDelta?: number;
  recognitionDelta?: number;
  pronunciationDelta?: number;
  script?: "kanji" | "kana";
}

export interface LessonSession {
  lessonId: string;
  currentPhaseIndex: number;
  activityIndex: number;
  elapsedSeconds: number;
  startedAt: string;
  updatedAt: string;
  completedPhaseIds: LessonPhaseId[];
  /** Phases deliberately skipped by the learner. Each contributes zero score. */
  skippedPhaseIds?: LessonPhaseId[];
  activities: Record<string, LessonActivityProgress>;
  storyInteractions: StoryInteraction[];
  storyComplete: boolean;
  vocabularyAnswers: VocabularyAnswer[];
  grammarAnswers: GrammarAnswer[];
  readingAnswers: ReadingComprehensionAnswer[];
  readingEvents: ReadingEvent[];
  readingComplete: boolean;
  listeningEvents: ListeningEvent[];
  listeningComplete: boolean;
  speakingEvents: SpeakingEvent[];
  speakingComplete: boolean;
  completionResult: LessonCompletionResult | null;
  /** Missing only on sessions persisted before the canonical-completion rollout. */
  completionState?: LessonCompletionState;
  completed: boolean;
  rewarded: boolean;
}
