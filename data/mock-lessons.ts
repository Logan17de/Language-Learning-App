import type { LessonPackage } from "@/types/lesson";

export const commuteLesson: LessonPackage = {
  id: "lesson_n4_commute_001",
  title: "Going to Work",
  japaneseTitle: "会社へ行く朝",
  topic: "Daily life",
  level: "N4",
  durationMinutes: 30,
  status: "published",
  source: "curated_seed",
  tags: ["commute", "work", "station", "daily life", "conversation"],
  summary: "Follow Yuki’s morning commute and learn to describe two actions happening at once.",
  storyPreview: "ゆきさんは音楽を聞きながら、駅まで歩きます。",
  grammar: [
    {
      id: "grammar_nagara",
      pattern: "〜ながら",
      meaning: "while doing",
      structure: "Verb stem + ながら",
      usage: "Connects two simultaneous actions by the same person.",
      example: "音楽を聞きながら、駅まで歩きます。",
      translation: "I walk to the station while listening to music.",
      commonMistake: "The main action comes after ながら.",
    },
    {
      id: "grammar_youninaru",
      pattern: "〜ようになる",
      meaning: "to come to / become able to",
      structure: "Dictionary verb + ようになる",
      usage: "Describes a gradual change in habit or ability.",
      example: "早く起きられるようになりました。",
      translation: "I have become able to wake up early.",
      commonMistake: "Use it for a change over time, not a one-time decision.",
    },
  ],
  kanji: [
    { character: "働", reading: "はたら", meaning: "work" },
    { character: "場", reading: "ば", meaning: "place" },
    { character: "駅", reading: "えき", meaning: "station", isReview: true },
    { character: "改札", reading: "かいさつ", meaning: "ticket gate" },
  ],
  vocabulary: [
    { term: "駅", reading: "えき", meaning: "station", partOfSpeech: "noun" },
    { term: "働く", reading: "はたらく", meaning: "to work", partOfSpeech: "verb" },
    { term: "会社", reading: "かいしゃ", meaning: "company", partOfSpeech: "noun" },
    { term: "一緒に", reading: "いっしょに", meaning: "together", partOfSpeech: "adverb" },
    { term: "改札", reading: "かいさつ", meaning: "ticket gate", partOfSpeech: "noun" },
  ],
  reviewItems: ["駅", "〜ので"],
  story: [
    { id: "s1", japanese: "朝、ゆきさんは六時半に起きます。", english: "Yuki wakes up at 6:30 in the morning.", tappableTerms: ["朝"] },
    { id: "s2", japanese: "最近、早く起きられるようになりました。", english: "Recently, she has become able to wake up early.", tappableTerms: ["最近", "早く"] },
    { id: "s3", japanese: "コーヒーを飲みながら、ニュースを読みます。", english: "She reads the news while drinking coffee.", tappableTerms: ["飲み", "読み"] },
    { id: "s4", japanese: "七時十五分に家を出ます。", english: "She leaves home at 7:15.", tappableTerms: ["家", "出"] },
    { id: "s5", japanese: "音楽を聞きながら、駅まで歩きます。", english: "She walks to the station while listening to music.", tappableTerms: ["聞き", "駅", "歩き"] },
    { id: "s6", japanese: "改札で同僚の田中さんに会います。", english: "She meets her colleague Tanaka at the ticket gate.", tappableTerms: ["改札", "同僚", "会い"] },
    { id: "s7", japanese: "二人は一緒に電車に乗ります。", english: "The two get on the train together.", tappableTerms: ["一緒に", "電車", "乗り"] },
    { id: "s8", japanese: "会社は駅から十分です。", english: "The company is ten minutes from the station.", tappableTerms: ["会社", "駅"] },
    { id: "s9", japanese: "ゆきさんはIT会社で働いています。", english: "Yuki works at an IT company.", tappableTerms: ["会社", "働いて"] },
    { id: "s10", japanese: "新しい仕事にも慣れるようになりました。", english: "She has also become used to her new work.", tappableTerms: ["新しい", "仕事", "慣れる"] },
  ],
  images: [
    { id: "img_commute_station", description: "A calm morning walk to the station", accent: "moss" },
    { id: "img_commute_train", description: "Colleagues riding the train together", accent: "persimmon" },
  ],
  readingConversation: [
    { speaker: "田中", japanese: "おはようございます。今日も早いですね。", english: "Good morning. You’re early again today." },
    { speaker: "ゆき", japanese: "最近、早く起きられるようになったんです。", english: "Recently, I’ve become able to wake up early." },
    { speaker: "田中", japanese: "電車で話しながら行きましょう。", english: "Let’s go while chatting on the train." },
  ],
  listeningExercises: [
    {
      id: "listen_1",
      prompt: "Where does Yuki meet Tanaka?",
      choices: ["At the café", "At the ticket gate", "At the office", "On the bus"],
      correctAnswer: "At the ticket gate",
      explanation: "The speaker says 改札で田中さんに会います.",
    },
  ],
  speakingExercises: [
    { id: "speak_1", prompt: "Say what you do while commuting.", modelAnswer: "音楽を聞きながら、会社へ行きます。", mode: "medium" },
  ],
  reviewQuestions: [
    {
      id: "review_1",
      prompt: "What is the reading of 駅?",
      choices: ["えき", "いき", "えぎ", "いけ"],
      correctAnswer: "えき",
      explanation: "駅 is read えき and means station.",
    },
  ],
  answerKeys: ["えき", "At the ticket gate", "音楽を聞きながら、会社へ行きます。"],
  phases: [
    { id: "story", label: "Story", description: "Meet today’s language in context" },
    { id: "vocabulary", label: "Words & kanji", description: "Build fast recognition" },
    { id: "grammar", label: "Grammar", description: "Understand two useful patterns" },
    { id: "reading", label: "Read aloud", description: "Practice rhythm and recognition" },
    { id: "listening", label: "Listening", description: "Listen for meaning" },
    { id: "speaking", label: "Speaking", description: "Produce natural Japanese" },
    { id: "review", label: "Final review", description: "Retrieve without hints" },
  ],
};

function lessonVariant(
  id: string,
  title: string,
  japaneseTitle: string,
  topic: string,
  level: LessonPackage["level"],
  durationMinutes: number,
  summary: string,
  tags: string[],
): LessonPackage {
  return {
    ...commuteLesson,
    id,
    title,
    japaneseTitle,
    topic,
    level,
    durationMinutes,
    summary,
    storyPreview: topic === "Technology"
      ? "会社でパソコンを直しながら、同僚に説明します。"
      : topic === "Health"
        ? "受付で話しながら、必要な書類を書きます。"
        : commuteLesson.storyPreview,
    tags,
    source: "curated_seed",
    status: "published",
  };
}

export const cafeLesson = lessonVariant(
  "lesson_n4_cafe_002",
  "Meeting at a Café",
  "カフェで待ち合わせ",
  "Conversation",
  "N4",
  20,
  "Meet a friend at a neighborhood café and practice making plans naturally.",
  ["café", "friends", "plans", "food", "conversation"],
);

export const shoppingLesson = lessonVariant(
  "lesson_n4_shopping_003",
  "Finding the Right Size",
  "ちょうどいいサイズ",
  "Shopping",
  "N4",
  25,
  "Ask a shop assistant for another size and compare everyday choices.",
  ["shopping", "clothes", "sizes", "daily life"],
);

export const trainLesson = lessonVariant(
  "lesson_n5_train_004",
  "Your First Train Transfer",
  "はじめての乗り換え",
  "Travel",
  "N5",
  15,
  "Follow station signs, ask for help, and make a simple train transfer.",
  ["travel", "train", "station", "directions"],
);

export const itSupportLesson = lessonVariant(
  "lesson_n3_it_005",
  "IT Support at Work",
  "職場のITサポート",
  "Technology",
  "N3",
  30,
  "Explain a computer problem and guide a colleague through a solution.",
  ["technology", "IT support", "workplace", "computer", "AI"],
);

export const hospitalLesson = lessonVariant(
  "lesson_n4_hospital_006",
  "At the Hospital Reception",
  "病院の受付で",
  "Health",
  "N4",
  30,
  "Describe a simple symptom, complete reception, and understand the next step.",
  ["hospital", "health", "daily life", "reception"],
);

export const interviewLesson = lessonVariant(
  "lesson_n3_interview_007",
  "A Japanese Job Interview",
  "日本語の面接",
  "Work",
  "N3",
  45,
  "Introduce your experience and answer common workplace interview questions.",
  ["job interview", "workplace", "career", "speaking"],
);

export const mockLessons: LessonPackage[] = [
  commuteLesson,
  cafeLesson,
  shoppingLesson,
  trainLesson,
  itSupportLesson,
  hospitalLesson,
  interviewLesson,
];

export function getLessonById(id: string): LessonPackage | undefined {
  return mockLessons.find((lesson) => lesson.id === id);
}
