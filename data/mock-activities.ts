import type { GrammarExerciseType, VocabularyMode } from "@/types/lesson-session";

export type ExerciseDifficulty = "Easy" | "Medium" | "Hard";

export interface VocabularyQuestion {
  id: string;
  mode: VocabularyMode;
  modeLabel: string;
  difficulty: ExerciseDifficulty;
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
  difficulty: ExerciseDifficulty;
  answerMode: "choice" | "text";
  prompt: string;
  cue: string;
  choices: string[];
  correctAnswer: string;
  acceptedAnswers?: string[];
  explanation: string;
  hintFront: string;
  hintBack: string;
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
    difficulty: "Easy",
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
    difficulty: "Easy",
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
    difficulty: "Easy",
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
    difficulty: "Medium",
    prompt: "Choose the Japanese for “together.”",
    cue: "together",
    choices: ["一緒に", "会社", "改札", "最近"],
    correctAnswer: "一緒に",
    explanation: "一緒に（いっしょに）means together.",
  },
  {
    id: "vocab_kaisatsu_mixed",
    mode: "mixed",
    modeLabel: "Meaning → Kanji",
    difficulty: "Medium",
    prompt: "Which word means “ticket gate”?",
    cue: "ticket gate",
    choices: ["改札", "駅", "会社", "電車"],
    correctAnswer: "改札",
    explanation: "改札（かいさつ）is the ticket gate at a station.",
  },
  {
    id: "vocab_douryou_meaning",
    mode: "reading-meaning",
    modeLabel: "Word → Meaning",
    difficulty: "Medium",
    prompt: "Choose the closest meaning.",
    cue: "同僚（どうりょう）",
    choices: ["coworker", "passenger", "manager", "neighbor"],
    correctAnswer: "coworker",
    explanation: "同僚 means a coworker or colleague.",
  },
  {
    id: "vocab_densha_reading",
    mode: "kanji-reading",
    modeLabel: "Kanji → Hiragana",
    difficulty: "Medium",
    prompt: "Choose the reading used in the story.",
    cue: "電車",
    choices: ["でんしゃ", "てんしゃ", "でんじゃ", "てんじゃ"],
    correctAnswer: "でんしゃ",
    explanation: "電車 is read でんしゃ and means train.",
  },
  {
    id: "vocab_context_kaisatsu",
    mode: "mixed",
    modeLabel: "Context",
    difficulty: "Hard",
    prompt: "Choose the word that completes the sentence.",
    cue: "駅の＿＿で田中さんに会いました。",
    choices: ["改札", "会社", "音楽", "朝"],
    correctAnswer: "改札",
    explanation: "駅の改札 means the station ticket gate.",
  },
  {
    id: "vocab_saikin_pair",
    mode: "mixed",
    modeLabel: "Reading + Meaning",
    difficulty: "Hard",
    prompt: "Choose the complete match for 最近.",
    cue: "最近",
    choices: ["さいきん · recently", "さいきん · every day", "さっき · recently", "さいご · finally"],
    correctAnswer: "さいきん · recently",
    explanation: "最近 is read さいきん and means recently.",
  },
  {
    id: "vocab_context_hataraku",
    mode: "mixed",
    modeLabel: "Context",
    difficulty: "Hard",
    prompt: "Which word best completes the idea “work at a company”?",
    cue: "会社で＿＿。",
    choices: ["働きます", "歩きます", "聞きます", "起きます"],
    correctAnswer: "働きます",
    explanation: "会社で働きます means “I work at a company.”",
  },
];

export const grammarQuestions: GrammarQuestion[] = [
  {
    id: "grammar_particle_wo",
    type: "fill-blank",
    skill: "understanding",
    difficulty: "Easy",
    answerMode: "choice",
    prompt: "Choose the object particle.",
    cue: "コーヒー＿＿飲みます。",
    choices: ["を", "に", "で", "と"],
    correctAnswer: "を",
    explanation: "を marks コーヒー as the thing being drunk.",
    hintFront: "コーヒー",
    hintBack: "飲みます。",
  },
  {
    id: "grammar_particle_made",
    type: "fill-blank",
    skill: "understanding",
    difficulty: "Easy",
    answerMode: "choice",
    prompt: "Choose the particle meaning “as far as / until.”",
    cue: "駅＿＿歩きます。",
    choices: ["まで", "を", "と", "が"],
    correctAnswer: "まで",
    explanation: "まで marks the destination or endpoint: as far as the station.",
    hintFront: "駅",
    hintBack: "歩きます。",
  },
  {
    id: "grammar_connector_te",
    type: "fill-blank",
    skill: "understanding",
    difficulty: "Easy",
    answerMode: "choice",
    prompt: "Choose the connector for two actions in sequence.",
    cue: "六時半に起き＿＿、コーヒーを飲みます。",
    choices: ["て", "を", "まで", "ながら"],
    correctAnswer: "て",
    explanation: "The て-form connects waking up and then drinking coffee.",
    hintFront: "六時半に起き",
    hintBack: "コーヒーを飲みます。",
  },
  {
    id: "grammar_nagara_mcq",
    type: "multiple-choice",
    skill: "understanding",
    difficulty: "Medium",
    answerMode: "choice",
    prompt: "What does 〜ながら express here?",
    cue: "音楽を聞きながら、駅まで歩きます。",
    choices: ["Two actions at the same time", "A past habit", "A strong request", "A reason"],
    correctAnswer: "Two actions at the same time",
    explanation: "〜ながら connects two simultaneous actions by the same person.",
    hintFront: "音楽を聞き",
    hintBack: "駅まで歩きます。",
  },
  {
    id: "grammar_nagara_blank",
    type: "fill-blank",
    skill: "production",
    difficulty: "Medium",
    answerMode: "choice",
    prompt: "Complete the lesson pattern.",
    cue: "コーヒーを飲み＿＿、ニュースを読みます。",
    choices: ["ながら", "ように", "ので", "でも"],
    correctAnswer: "ながら",
    explanation: "Use the verb stem 飲み + ながら.",
    hintFront: "コーヒーを飲み",
    hintBack: "ニュースを読みます。",
  },
  {
    id: "grammar_particle_ni_context",
    type: "fill-blank",
    skill: "understanding",
    difficulty: "Medium",
    answerMode: "choice",
    prompt: "Choose the particle required by 慣れる.",
    cue: "新しい仕事＿＿慣れてきました。",
    choices: ["に", "を", "へ", "まで"],
    correctAnswer: "に",
    explanation: "慣れる takes に for the thing or situation someone becomes accustomed to.",
    hintFront: "新しい仕事",
    hintBack: "慣れてきました。",
  },
  {
    id: "grammar_youninaru_order",
    type: "sentence-order",
    skill: "production",
    difficulty: "Medium",
    answerMode: "choice",
    prompt: "Choose the correctly ordered sentence.",
    cue: "became able to wake up early",
    choices: [
      "早く起きられるようになりました。",
      "ように早くなりました起きられる。",
      "起きられる早くなりましたように。",
      "なりましたように起きられる早く。",
    ],
    correctAnswer: "早く起きられるようになりました。",
    explanation: "The change pattern follows the potential verb: 起きられる + ようになりました.",
    hintFront: "早く起きられる",
    hintBack: "なりました。",
  },
  {
    id: "grammar_translate_nagara",
    type: "natural-sentence",
    skill: "production",
    difficulty: "Hard",
    answerMode: "text",
    prompt: "Translate the whole sentence into Japanese.",
    cue: "I listen to music while I walk to the station.",
    choices: [],
    correctAnswer: "音楽を聞きながら、駅まで歩きます。",
    acceptedAnswers: ["音楽を聞きながら駅まで歩きます"],
    explanation: "Put the secondary action in verb-stem + ながら, followed by the main action.",
    hintFront: "音楽を聞き",
    hintBack: "歩きます。",
  },
  {
    id: "grammar_translate_youninaru",
    type: "natural-sentence",
    skill: "production",
    difficulty: "Hard",
    answerMode: "text",
    prompt: "Translate the whole sentence into Japanese.",
    cue: "I became able to wake up at six thirty.",
    choices: [],
    correctAnswer: "六時半に起きられるようになりました。",
    acceptedAnswers: ["6時半に起きられるようになりました"],
    explanation: "Use the potential form 起きられる before ようになりました.",
    hintFront: "六時半に起きられる",
    hintBack: "なりました。",
  },
  {
    id: "grammar_translate_commute",
    type: "natural-sentence",
    skill: "production",
    difficulty: "Hard",
    answerMode: "text",
    prompt: "Translate the whole sentence into Japanese.",
    cue: "Recently, I have become able to go to work with a coworker.",
    choices: [],
    correctAnswer: "最近、同僚と一緒に会社へ行けるようになりました。",
    acceptedAnswers: [
      "最近同僚と一緒に会社へ行けるようになりました",
      "最近、同僚と一緒に会社に行けるようになりました。",
    ],
    explanation: "Combine 最近, 同僚と一緒に, and the potential form 行ける + ようになりました.",
    hintFront: "最近、同僚と一緒に",
    hintBack: "ようになりました。",
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
