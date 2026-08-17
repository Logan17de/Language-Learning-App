import "server-only";

import type { JLPTLevel } from "@/types/lesson";

export interface PlannedKanji {
  character: string;
  level: JLPTLevel;
}

export interface PlannedGrammar {
  pattern: string;
  level: JLPTLevel;
}

export interface LessonPlan {
  kanji: PlannedKanji[];
  grammar: PlannedGrammar[];
  knownKanji: string[];
}

export interface DraftTerm {
  surface: string;
  readingHint: string;
  scriptType: "kanji" | "hiragana" | "katakana";
}

export interface StoryDraftLine {
  japanese: string;
  english: string;
  terms: DraftTerm[];
}

export interface StoryDraft {
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  lines: StoryDraftLine[];
}

export interface MissingVocabulary {
  writtenForm: string;
  readingHint: string;
  contextJapanese: string;
  contextEnglish: string;
}

export interface LibraryEnrichmentRequest {
  level: JLPTLevel;
  topic: string;
  kanji: string[];
  allowedKanji: string[];
  grammar: string[];
  vocabulary: MissingVocabulary[];
}

export interface LibrarySeedKanji {
  character: string;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

export interface LibrarySeedGrammar {
  pattern: string;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  exampleSentences: string[];
}

export interface LibrarySeedVocabulary {
  writtenForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  tags: string[];
  exampleSentence: string;
  linkedKanjiCharacters: string[];
}

export interface LibrarySeed {
  kanji: LibrarySeedKanji[];
  grammar: LibrarySeedGrammar[];
  vocabulary: LibrarySeedVocabulary[];
}

export interface CanonicalKanji {
  libraryId: string;
  character: string;
  level: JLPTLevel;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

export interface CanonicalGrammar {
  libraryId: string;
  pattern: string;
  level: JLPTLevel;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  examples: string[];
}

export interface CanonicalVocabulary {
  libraryId: string;
  term: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  level: JLPTLevel;
  tags: string[];
  exampleSentence: string;
  linkedKanjiIds: string[];
}

export interface ResolvedLessonLibrary {
  kanji: CanonicalKanji[];
  grammar: CanonicalGrammar[];
  vocabulary: CanonicalVocabulary[];
  generationContext?: {
    targetGrammar: string[];
    targetKanji: string[];
  };
}

export interface GenerationAuditEntry {
  stage:
    | "story"
    | "library"
    | "activities"
    | "vocabulary_activities"
    | "grammar_reading_activities"
    | "communication_activities"
    | "lesson_assembly"
    | "audio";
  model: string;
  repaired: boolean;
}

interface RawPracticeQuestion {
  activityType: "multiple_choice" | "text_input";
  difficulty: "Easy" | "Medium" | "Hard";
  mode: string;
  skill: "understanding" | "production";
  prompt: string;
  cue: string;
  choices: string[];
  correctAnswer: string;
  acceptedAnswers: string[];
  explanation: string;
  hintFront: string;
  hintBack: string;
  targetItemIds: string[];
}

interface RawReadingLine {
  speaker: string;
  japanese: string;
  english: string;
  targetItemIds: string[];
}

interface RawListeningExercise {
  difficulty: "Easy" | "Medium" | "Hard";
  conversationLines: string[];
  prompt: string;
  transcript: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  targetItemIds: string[];
}

interface RawSpeakingExercise {
  mode: "easy" | "medium" | "hard";
  questionType: "read_aloud";
  prompt: string;
  easyPrompt: string;
  mediumPrompt: string;
  hardPrompt: string;
  expectedAnswer: string;
  modelAnswer: string;
  expectedConcepts: string[];
  semanticCriteria: string[];
  targetItemIds: string[];
}

export interface InspectableTerm {
  libraryId: string;
  libraryType: "kanji" | "vocabulary";
  surface: string;
  reading: string;
  meaning: string;
  scriptType: "kanji" | "hiragana" | "katakana";
}

export interface PlayablePracticeQuestion extends RawPracticeQuestion {
  inspectableTerms: InspectableTerm[];
}

/** Current durable custom-lesson package assembled from the three activity groups. */
export interface PlayableLessonPackageV2 {
  schemaVersion: 2;
  title: string;
  japaneseTitle: string;
  summary: string;
  storyPreview: string;
  tags: string[];
  kanji: Array<{
    libraryId: string;
    character: string;
    reading: string;
    meaning: string;
  }>;
  vocabulary: CanonicalVocabulary[];
  grammar: Array<{
    libraryId: string;
    pattern: string;
    meaning: string;
    structure: string;
    usage: string;
    example: string;
    translation: string;
    commonMistake: string;
  }>;
  story: Array<{
    japanese: string;
    english: string;
    words: InspectableTerm[];
  }>;
  vocabularyQuestions: PlayablePracticeQuestion[];
  grammarQuestions: PlayablePracticeQuestion[];
  readingTitle: string;
  readingJapaneseTitle: string;
  readingConversation: Array<
    RawReadingLine & { inspectableTerms: InspectableTerm[] }
  >;
  readingQuestions: Array<{
    id: string;
    difficulty: "easy" | "medium" | "hard";
    question: string;
    answer: string;
  }>;
  listeningExercises: Array<
    RawListeningExercise & { inspectableTerms: InspectableTerm[] }
  >;
  speakingExercises: Array<
    RawSpeakingExercise & { inspectableTerms: InspectableTerm[] }
  >;
  generationAudit: {
    calls: GenerationAuditEntry[];
  };
}
