import type { JLPTLevel } from "@/types/lesson";

export type Difficulty = "easy" | "medium" | "hard";
export type ScriptType = "kanji" | "hiragana" | "katakana";
export type ExerciseFormat =
  | "multiple_choice"
  | "fill_blank"
  | "sentence_order"
  | "error_correction"
  | "translation"
  | "sentence_creation"
  | "context_selection";

export interface KanjiTarget {
  id: string;
  legacyId: string | null;
  character: string;
  level: JLPTLevel;
  meanings: string[];
  readings: string[];
  isKnown: boolean;
  mastery: number | null;
}

export interface GrammarTarget {
  id: string;
  legacyId: string | null;
  pattern: string;
  level: JLPTLevel;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  examples: string[];
  isKnown: boolean;
  mastery: number | null;
}

export interface VocabularyLibraryItem {
  id: string;
  legacyId: string | null;
  writtenForm: string;
  reading: string;
  meaning: string;
  partOfSpeech: string;
  level: JLPTLevel;
  tags: string[];
  exampleSentence: string;
  linkedKanjiIds: string[];
}

export interface SelectedLessonTargets {
  kanji: KanjiTarget[];
  grammar: GrammarTarget[];
  vocabulary: VocabularyLibraryItem[];
  knownKanji: string[];
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

export interface LessonLibrarySeed {
  kanji: LibrarySeedKanji[];
  grammar: LibrarySeedGrammar[];
  vocabulary: LibrarySeedVocabulary[];
}

export interface LessonGenerationInput {
  topic: string;
  level: JLPTLevel;
  interests: string[];
  durationMinutes: number;
  focus: string;
  speakingDifficulty: Difficulty;
  note: string;
  tone: "encouraging";
  targets: SelectedLessonTargets;
}

export interface LessonBlueprint {
  title: string;
  japaneseTitle: string;
  summary: string;
  setting: string;
  characters: string[];
  storySummary: string;
  learningObjectives: string[];
  coreVocabularyIds: string[];
}

export interface InspectableTerm {
  libraryId: string;
  surface: string;
  reading: string;
  meaning: string;
  scriptType: ScriptType;
}

export interface StoryLineOutput {
  id: string;
  paragraph: number;
  japanese: string;
  english: string;
  inspectableTerms: InspectableTerm[];
}

export interface StorySection {
  preview: string;
  lines: StoryLineOutput[];
}

export interface QuestionContent {
  instruction: string;
  japanese: string;
  englishPrompt: string;
  choices: string[];
  hintFront: string;
  hintBack: string;
  inspectableTerms: InspectableTerm[];
}

export interface AnswerData {
  correctAnswer: string;
  acceptedAnswers: string[];
  explanation: string;
  semanticCriteria: string[];
}

export interface UniversalExercise {
  id: string;
  difficulty: Difficulty;
  format: ExerciseFormat;
  targetIds: string[];
  questionContent: QuestionContent;
  answerData: AnswerData;
}

export interface ExerciseSection {
  exercises: UniversalExercise[];
}

export interface ReadingLineOutput {
  id: string;
  speaker: string;
  japanese: string;
  english: string;
  inspectableTerms: InspectableTerm[];
}

export interface ReadingSection {
  lines: ReadingLineOutput[];
}

export interface ListeningSet {
  id: string;
  difficulty: Difficulty;
  title: string;
  transcript: string;
  transcriptTerms: InspectableTerm[];
  questions: UniversalExercise[];
}

export interface ListeningSection {
  sets: ListeningSet[];
}

export interface SpeakingTask {
  id: string;
  difficulty: Difficulty;
  prompt: string;
  promptTerms: InspectableTerm[];
  modelAnswer: string;
  expectedConcepts: string[];
  semanticCriteria: string[];
}

export interface SpeakingSection {
  tasks: SpeakingTask[];
}

export interface InteractiveTurn {
  id: string;
  difficulty: Difficulty;
  aiPrompt: string;
  promptTerms: InspectableTerm[];
  expectedConcepts: string[];
  exampleAnswers: string[];
  semanticCriteria: string[];
}

export interface InteractiveSection {
  turns: InteractiveTurn[];
}

export type GenerationSectionName =
  | "blueprint"
  | "story"
  | "vocabulary"
  | "grammar"
  | "reading"
  | "listening"
  | "speaking"
  | "interactive";

export interface GenerationAttempt {
  section: GenerationSectionName;
  model: string;
  repaired: boolean;
  issues: string[];
}

export interface UniversalLessonPackage {
  schemaVersion: 1;
  blueprint: LessonBlueprint;
  targets: {
    kanji: KanjiTarget[];
    grammar: GrammarTarget[];
  };
  knownKanji: string[];
  story: StorySection;
  vocabulary: ExerciseSection;
  grammar: ExerciseSection;
  reading: ReadingSection;
  listening: ListeningSection;
  speaking: SpeakingSection;
  interactive: InteractiveSection;
  renderingPolicy: {
    questionContentInspectable: true;
    answerDataInspectable: false;
    unknownKanjiReadingFormat: "surface（reading）";
  };
  generationAudit: {
    primaryModel: string;
    fallbackModel: string;
    attempts: GenerationAttempt[];
  };
}
