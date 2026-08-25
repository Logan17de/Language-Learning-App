export type JLPTLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';
export type LessonPhase = 'story' | 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'speaking';

export interface Profile {
  id: string;
  display_name: string;
  email: string;
  current_jlpt_level: JLPTLevel;
  subscription_plan: 'free' | 'premium_monthly' | 'premium_yearly' | 'lifetime';
  role: string;
  xp: number;
  streak_days: number;
  total_study_minutes: number;
}

export interface LessonCreationState {
  plan: 'free' | 'premium';
  canCreate: boolean;
  dailyLimit: number;
  creationsToday: number;
  requestId: string | null;
  requestStatus: string | null;
  lessonId: string | null;
  lessonState: string | null;
  resumeTopic: string | null;
  resumeLevel: JLPTLevel | null;
  resumeLessonId: string | null;
  resumeLessonState: 'ready' | 'active' | null;
}

export interface MasteryItem { item_type: string; mastery: number; meaning_score: number; recognition_score: number; pronunciation_score: number; }

export interface LessonRow {
  id: string; title: string; japanese_title: string; summary: string; topic: string; jlpt_level: JLPTLevel; duration_minutes: number; current_version_id: string | null;
}
export interface LessonVersion { id: string; lesson_id: string; phases: unknown; }
export interface StoryLine { id: string; position: number; japanese_text: string; translation: string; }
export interface StoryWord { id: string; story_line_id: string; position: number; surface: string; reading: string; meaning: string; script_type: 'kanji' | 'hiragana' | 'katakana'; }
export interface VocabularyItem { id: string; position: number; written_form: string; reading: string; meaning: string; part_of_speech: string; }
export interface GrammarItem { id: string; position: number; pattern: string; meaning: string; structure: string; usage_notes: string; example: string; translation: string; }
export interface PracticeActivity { id: string; position: number; phase: 'vocabulary' | 'grammar'; activity_type: string; difficulty: string; prompt: string; cue: string; choices: string[]; correct_answer: string; explanation: string; hint_front: string; hint_back: string; }
export interface ReadingSection { id: string; position: number; speaker: string; japanese_text: string; translation: string; }
export interface ReadingQuestion { id: string; position: number; difficulty: string; question: string; answer: string; }
export interface ListeningActivity { id: string; position: number; difficulty: string; prompt: string; transcript: string; choices: string[]; correct_answer: string; explanation: string; audio_asset_id: string | null; }
export interface SpeakingActivity { id: string; position: number; mode: string; prompt: string; model_answer: string; expected_answer: string | null; }

export interface PlayableLesson {
  lesson: LessonRow;
  version: LessonVersion;
  story: StoryLine[];
  storyWords: StoryWord[];
  vocabulary: VocabularyItem[];
  grammar: GrammarItem[];
  practice: PracticeActivity[];
  reading: ReadingSection[];
  readingQuestions: ReadingQuestion[];
  listening: ListeningActivity[];
  speaking: SpeakingActivity[];
  premiumPhaseAccess: 'full' | 'locked';
  knownKanji: string[];
}
