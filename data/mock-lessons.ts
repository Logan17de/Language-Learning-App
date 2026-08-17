import type { LessonPackage } from "@/types/lesson";
import { fallbackStoryWords } from "@/lib/story-support";
import { canonicalLessonPhases } from "@/lib/lesson-contract";

function mockStoryLine(
  id: string,
  japanese: string,
  english: string,
  tappableTerms: string[],
): LessonPackage["story"][number] {
  return {
    id,
    japanese,
    english,
    tappableTerms,
    words: fallbackStoryWords(id, japanese, tappableTerms, []),
  };
}

function demoReadingQuestions(): NonNullable<LessonPackage["readingQuestions"]> {
  const difficulties = ["easy", "easy", "medium", "medium", "hard"] as const;
  return difficulties.map((difficulty, index) => ({
    id: `reading_demo_${index + 1}`,
    difficulty,
    question: index === 0
      ? "ゆきさんは何時に起きますか。"
      : "ゆきさんの朝について日本語で答えてください。",
    answer: index === 0
      ? "ゆきさんは六時半に起きます。"
      : "ゆきさんは朝、準備をして駅へ行きます。",
  }));
}

function demoListeningExercises(): LessonPackage["listeningExercises"] {
  return Array.from({ length: 5 }, (_, index) => ({
    id: `listen_${index + 1}`,
    prompt: index === 0
      ? "Where does Yuki meet Tanaka?"
      : "What are Yuki and Tanaka talking about?",
    choices: ["At the ticket gate", "At the café", "At the office", "On the bus"],
    correctAnswer: "At the ticket gate",
    explanation: "The conversation says they meet at the ticket gate.",
    transcript: "田中：おはようございます。\nゆき：おはようございます。\n田中：改札で会いましたね。\nゆき：はい。\n田中：一緒に行きましょう。",
    conversationLines: [
      "田中：おはようございます。",
      "ゆき：おはようございます。",
      "田中：改札で会いましたね。",
      "ゆき：はい。",
      "田中：一緒に行きましょう。",
    ],
    difficulty: index < 2 ? ("Easy" as const) : index < 4 ? ("Medium" as const) : ("Hard" as const),
  }));
}

function demoSpeakingExercises(): LessonPackage["speakingExercises"] {
  const modes = ["easy", "easy", "medium", "medium", "hard"] as const;
  const sentences = [
    "ゆきさんは駅まで歩きます。",
    "ゆきさんは会社へ行きます。",
    "音楽を聞きながら、駅まで歩きます。",
    "改札で田中さんに会って、一緒に電車に乗ります。",
    "最近、ゆきさんは早く起きられるようになり、朝の時間を上手に使っています。",
  ];
  return modes.map((mode, index) => ({
    id: `speak_${index + 1}`,
    prompt: sentences[index],
    modelAnswer: sentences[index],
    expectedAnswer: sentences[index],
    questionType: "read_aloud",
    mode,
  }));
}

const commuteLessonBase: Omit<
  LessonPackage,
  "vocabularyQuestions" | "grammarQuestions"
> = {
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
    { character: "駅", reading: "えき", meaning: "station" },
    { character: "改札", reading: "かいさつ", meaning: "ticket gate" },
  ],
  vocabulary: [
    { term: "駅", reading: "えき", meaning: "station", partOfSpeech: "noun" },
    { term: "働く", reading: "はたらく", meaning: "to work", partOfSpeech: "verb" },
    { term: "会社", reading: "かいしゃ", meaning: "company", partOfSpeech: "noun" },
    { term: "一緒に", reading: "いっしょに", meaning: "together", partOfSpeech: "adverb" },
    { term: "改札", reading: "かいさつ", meaning: "ticket gate", partOfSpeech: "noun" },
  ],
  story: [
    mockStoryLine("s1", "朝、ゆきさんは六時半に起きます。", "Yuki wakes up at 6:30 in the morning.", ["朝"]),
    mockStoryLine("s2", "最近、早く起きられるようになりました。", "Recently, she has become able to wake up early.", ["最近", "早く"]),
    mockStoryLine("s3", "コーヒーを飲みながら、ニュースを読みます。", "She reads the news while drinking coffee.", ["飲み", "読み"]),
    mockStoryLine("s4", "七時十五分に家を出ます。", "She leaves home at 7:15.", ["家", "出"]),
    mockStoryLine("s5", "音楽を聞きながら、駅まで歩きます。", "She walks to the station while listening to music.", ["聞き", "駅", "歩き"]),
    mockStoryLine("s6", "改札で同僚の田中さんに会います。", "She meets her colleague Tanaka at the ticket gate.", ["改札", "同僚", "会い"]),
    mockStoryLine("s7", "二人は一緒に電車に乗ります。", "The two get on the train together.", ["一緒に", "電車", "乗り"]),
    mockStoryLine("s8", "会社は駅から十分です。", "The company is ten minutes from the station.", ["会社", "駅"]),
    mockStoryLine("s9", "ゆきさんはIT会社で働いています。", "Yuki works at an IT company.", ["会社", "働いて"]),
    mockStoryLine("s10", "新しい仕事にも慣れるようになりました。", "She has also become used to her new work.", ["新しい", "仕事", "慣れる"]),
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
  readingQuestions: demoReadingQuestions(),
  listeningExercises: demoListeningExercises(),
  speakingExercises: demoSpeakingExercises(),
  phases: canonicalLessonPhases(),
};

function seedChoices(values: string[], answer: string): string[] {
  return [answer, ...values.filter((value) => value !== answer)].slice(0, 4);
}

function seedVocabularyQuestions(
  vocabulary: LessonPackage["vocabulary"],
): LessonPackage["vocabularyQuestions"] {
  const readings = vocabulary.map((item) => item.reading);
  const meanings = vocabulary.map((item) => item.meaning);

  return Array.from({ length: 13 }, (_, index) => {
    const item = vocabulary[index % vocabulary.length];
    const reading = index % 2 === 0;
    const difficulty = index < 6 ? ("Easy" as const) : index < 10 ? ("Medium" as const) : ("Hard" as const);
    return {
      id: `seed_vocab_${index + 1}`,
      mode: reading ? ("kanji-reading" as const) : ("reading-meaning" as const),
      modeLabel: reading ? "Kanji → reading" : "Reading → meaning",
      difficulty,
      prompt: reading ? `How do you read ${item.term}?` : `What does ${item.reading} mean?`,
      cue: reading ? item.term : item.reading,
      choices: seedChoices(reading ? readings : meanings, reading ? item.reading : item.meaning),
      correctAnswer: reading ? item.reading : item.meaning,
      acceptedAnswers: [reading ? item.reading : item.meaning],
      explanation: reading
        ? `${item.term} is read ${item.reading}.`
        : `${item.reading} means ${item.meaning}.`,
      targetItemIds: item.libraryId ? [item.libraryId] : [],
      inspectableTerms: [],
    };
  });
}

function seedGrammarQuestions(
  grammar: LessonPackage["grammar"],
): LessonPackage["grammarQuestions"] {
  const meanings = [
    ...grammar.map((point) => point.meaning),
    "because of",
    "even though",
  ];

  return Array.from({ length: 10 }, (_, index) => {
    const point = grammar[index % grammar.length];
    const difficulty = index < 3 ? ("Easy" as const) : index < 7 ? ("Medium" as const) : ("Hard" as const);
    return {
      id: `seed_grammar_${index + 1}`,
      type: "multiple-choice" as const,
      skill: "understanding" as const,
      difficulty,
      answerMode: "choice" as const,
      prompt: `What does ${point.pattern} express?`,
      cue: point.example,
      choices: seedChoices(meanings, point.meaning),
      correctAnswer: point.meaning,
      acceptedAnswers: [point.meaning],
      explanation: point.usage,
      hintFront: point.structure,
      hintBack: point.meaning,
      targetItemIds: point.libraryId ? [point.libraryId] : [],
      inspectableTerms: [],
    };
  });
}

export const commuteLesson: LessonPackage = {
  ...commuteLessonBase,
  vocabularyQuestions: seedVocabularyQuestions(commuteLessonBase.vocabulary),
  grammarQuestions: seedGrammarQuestions(commuteLessonBase.grammar),
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
