import type { GrammarExerciseType, VocabularyMode } from "@/types/lesson-session";

export interface VocabularyQuestion {
  id: string;
  mode: VocabularyMode;
  modeLabel: string;
  prompt: string;
  cue: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface GrammarQuestion {
  id: string;
  type: GrammarExerciseType;
  skill: "understanding" | "production";
  prompt: string;
  cue: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export interface FinalReviewQuestion {
  id: string;
  category: "kanji" | "vocabulary" | "grammar" | "listening" | "speaking";
  prompt: string;
  cue?: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
}

export const vocabularyQuestions: VocabularyQuestion[] = [
  {
    id: "vocab_eki_reading",
    mode: "kanji-reading",
    modeLabel: "Kanji → Hiragana",
    prompt: "Choose the correct reading.",
    cue: "駅",
    choices: ["えき", "いき", "えぎ", "いけ"],
    correctAnswer: "えき",
    explanation: "駅 is read えき and means station.",
  },
  {
    id: "vocab_hataraku_reading",
    mode: "kanji-reading",
    modeLabel: "Kanji → Hiragana",
    prompt: "Choose the correct reading.",
    cue: "働く",
    choices: ["はたらく", "うごく", "つとめる", "あるく"],
    correctAnswer: "はたらく",
    explanation: "働く（はたらく）means to work.",
  },
  {
    id: "vocab_kaisha_meaning",
    mode: "reading-meaning",
    modeLabel: "Hiragana → Meaning",
    prompt: "What does this word mean?",
    cue: "かいしゃ",
    choices: ["company", "station", "colleague", "train"],
    correctAnswer: "company",
    explanation: "かいしゃ is written 会社 and means company.",
  },
  {
    id: "vocab_isshoni_japanese",
    mode: "meaning-japanese",
    modeLabel: "Meaning → Japanese",
    prompt: "Choose the Japanese for “together.”",
    cue: "together",
    choices: ["一緒に", "会社", "改札", "最近"],
    correctAnswer: "一緒に",
    explanation: "一緒に（いっしょに）means together.",
  },
  {
    id: "vocab_kaisatsu_mixed",
    mode: "mixed",
    modeLabel: "Mixed Review",
    prompt: "Which word means “ticket gate”?",
    cue: "ticket gate",
    choices: ["改札", "駅", "会社", "電車"],
    correctAnswer: "改札",
    explanation: "改札（かいさつ）is the ticket gate at a station.",
  },
];

export const grammarQuestions: GrammarQuestion[] = [
  {
    id: "grammar_nagara_mcq",
    type: "multiple-choice",
    skill: "understanding",
    prompt: "What does 〜ながら express?",
    cue: "音楽を聞きながら、駅まで歩きます。",
    choices: ["Two actions at the same time", "A past habit", "A strong request", "A reason"],
    correctAnswer: "Two actions at the same time",
    explanation: "〜ながら connects two simultaneous actions by the same person.",
  },
  {
    id: "grammar_nagara_blank",
    type: "fill-blank",
    skill: "production",
    prompt: "Complete the sentence.",
    cue: "コーヒーを飲み＿＿、ニュースを読みます。",
    choices: ["ながら", "ように", "ので", "でも"],
    correctAnswer: "ながら",
    explanation: "Use the verb stem 飲み + ながら.",
  },
  {
    id: "grammar_youninaru_order",
    type: "sentence-order",
    skill: "production",
    prompt: "Choose the correctly ordered sentence.",
    cue: "became able to wake up early",
    choices: [
      "早く起きられるようになりました。",
      "ように早くなりました起きられる。",
      "起きられる早くなりましたように。",
      "なりましたように起きられる早く。",
    ],
    correctAnswer: "早く起きられるようになりました。",
    explanation: "The change pattern follows the dictionary or potential verb: 起きられる + ようになりました.",
  },
  {
    id: "grammar_natural",
    type: "natural-sentence",
    skill: "understanding",
    prompt: "Which sentence sounds more natural?",
    cue: "I have gradually become used to my new work.",
    choices: [
      "新しい仕事に慣れるようになりました。",
      "新しい仕事に慣れながらになりました。",
      "新しい仕事を慣れるようでした。",
      "新しい仕事がながら慣れました。",
    ],
    correctAnswer: "新しい仕事に慣れるようになりました。",
    explanation: "〜ようになる naturally describes a gradual change in habit or state.",
  },
];

export const finalReviewQuestions: FinalReviewQuestion[] = [
  {
    id: "final_kanji",
    category: "kanji",
    prompt: "What is the reading of 改札?",
    choices: ["かいさつ", "かいしゃ", "えき", "どうりょう"],
    correctAnswer: "かいさつ",
    explanation: "改札 is read かいさつ.",
  },
  {
    id: "final_vocabulary",
    category: "vocabulary",
    prompt: "Choose the Japanese for “together.”",
    choices: ["一緒に", "最近", "会社", "電車"],
    correctAnswer: "一緒に",
    explanation: "一緒に means together.",
  },
  {
    id: "final_grammar",
    category: "grammar",
    prompt: "Complete: 音楽を聞き＿＿、歩きます。",
    choices: ["ながら", "ように", "ので", "から"],
    correctAnswer: "ながら",
    explanation: "聞きながら means while listening.",
  },
  {
    id: "final_listening",
    category: "listening",
    prompt: "From the listening activity, where did Yuki meet Tanaka?",
    choices: ["At the ticket gate", "At the café", "At home", "At the office"],
    correctAnswer: "At the ticket gate",
    explanation: "Yuki met Tanaka at the ticket gate.",
  },
  {
    id: "final_speaking",
    category: "speaking",
    prompt: "Which is the most natural answer about commuting?",
    choices: [
      "音楽を聞きながら、会社へ行きます。",
      "音楽を会社ながら聞きます。",
      "会社を聞きながら音楽です。",
      "ながら会社音楽を行きます。",
    ],
    correctAnswer: "音楽を聞きながら、会社へ行きます。",
    explanation: "The ながら action comes first; the main action follows.",
  },
];
