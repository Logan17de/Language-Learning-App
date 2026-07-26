export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type LessonStatus = "draft" | "approved" | "published" | "rejected" | "archived" | "malformed";
export type LessonSource = "curated_seed" | "generated" | "user_generated" | "community";

export interface GrammarPoint {
  id: string;
  pattern: string;
  meaning: string;
  structure: string;
  usage: string;
  example: string;
  translation: string;
  commonMistake: string;
}

export interface KanjiItem {
  character: string;
  reading: string;
  meaning: string;
  isReview?: boolean;
}

export interface VocabularyItem {
  term: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  level?: JLPTLevel;
  exampleSentence?: string;
}

export type StoryWordScript = "kanji" | "hiragana" | "katakana";

export interface StoryWord {
  id: string;
  libraryId?: string;
  libraryType?: "kanji" | "vocabulary";
  position: number;
  surface: string;
  reading: string;
  meaning: string;
  scriptType: StoryWordScript;
  baseMeaningScore: number;
  baseRecognitionScore: number;
  basePronunciationScore: number;
}

export interface StoryLine {
  id: string;
  japanese: string;
  english: string;
  tappableTerms: string[];
  words: StoryWord[];
  imageId?: string;
  audioAssetId?: string;
}

export interface LessonImage {
  id: string;
  description: string;
  accent: "moss" | "persimmon";
}

export interface ConversationLine {
  speaker: string;
  japanese: string;
  english: string;
}

export interface ChoiceExercise {
  id: string;
  prompt: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  transcript?: string;
  audioAssetId?: string;
  questionType?: "multiple-choice" | "ordering" | "fill-blank" | "true-false";
}

export interface SpeakingExercise {
  id: string;
  prompt: string;
  modelAnswer: string;
  mode: "easy" | "medium" | "hard";
  easyPrompt?: string;
  mediumPrompt?: string;
  hardPrompt?: string;
  expectedAnswer?: string;
}

export interface LessonPhase {
  id: "story" | "vocabulary" | "grammar" | "reading" | "listening" | "speaking" | "review";
  label: string;
  description: string;
}

export interface LessonPackage {
  id: string;
  title: string;
  japaneseTitle: string;
  topic: string;
  level: JLPTLevel;
  durationMinutes: number;
  status: LessonStatus;
  source: LessonSource;
  tags?: string[];
  summary: string;
  storyPreview: string;
  grammar: GrammarPoint[];
  kanji: KanjiItem[];
  vocabulary: VocabularyItem[];
  reviewItems: string[];
  story: StoryLine[];
  images: LessonImage[];
  readingConversation: ConversationLine[];
  listeningExercises: ChoiceExercise[];
  speakingExercises: SpeakingExercise[];
  reviewQuestions: ChoiceExercise[];
  answerKeys: string[];
  phases: LessonPhase[];
}
