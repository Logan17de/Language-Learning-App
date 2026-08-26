import type {
  JLPTLevel,
  StoryWord,
  StoryWordScript,
  VocabularyItem,
} from "@/types/lesson";
import type { StoryInteraction } from "@/types/lesson-session";

export const STORY_RECOGNITION_PENALTY = 15;
export const STORY_READING_PENALTY = STORY_RECOGNITION_PENALTY;
export const STORY_MEANING_PENALTY = 25;
export const STORY_PRONUNCIATION_PENALTY = 15;

export interface StorySegment {
  text: string;
  term?: string;
}

export interface StoredStorySegment {
  text: string;
  word?: StoryWord;
}

export interface StoryWordScores {
  meaning: number;
  recognition: number;
  pronunciation: number;
}

export interface StoryLengthRange {
  min: number;
  max: number;
}

export function storyLengthRange(level: JLPTLevel): StoryLengthRange {
  const ranges: Record<JLPTLevel, StoryLengthRange> = {
    N5: { min: 10, max: 12 },
    N4: { min: 12, max: 14 },
    N3: { min: 14, max: 16 },
    N2: { min: 16, max: 18 },
    N1: { min: 18, max: 20 },
  };
  return ranges[level];
}

export function isKanaOnly(term: string): boolean {
  return /^[\u3040-\u309f\u30a0-\u30ffー]+$/u.test(term);
}

export function storyWordScript(surface: string): StoryWordScript {
  if (/\p{Script=Han}/u.test(surface)) return "kanji";
  if (/^[\u30a0-\u30ffー]+$/u.test(surface)) return "katakana";
  return "hiragana";
}

export function segmentStoryLine(
  japanese: string,
  tappableTerms: string[],
): StorySegment[] {
  const terms = Array.from(
    new Set(tappableTerms.filter((term) => term && japanese.includes(term))),
  ).sort((left, right) => right.length - left.length);
  if (!terms.length) return [{ text: japanese }];

  const termSet = new Set(terms);
  const pattern = new RegExp(
    `(${terms.map(escapeRegExp).join("|")})`,
    "gu",
  );
  return japanese
    .split(pattern)
    .filter(Boolean)
    .map((text) => ({ text, term: termSet.has(text) ? text : undefined }));
}

export function segmentStoredStoryLine(
  japanese: string,
  words: StoryWord[],
): StoredStorySegment[] {
  const uniqueWords = new Map<string, StoryWord>();
  for (const word of [...words].sort(
    (left, right) => left.position - right.position,
  )) {
    if (word.surface && !uniqueWords.has(word.surface)) {
      uniqueWords.set(word.surface, word);
    }
  }
  const candidates = [...uniqueWords.values()].sort(
    (left, right) => right.surface.length - left.surface.length,
  );
  if (candidates.length === 0) return [{ text: japanese }];

  const segments: StoredStorySegment[] = [];
  let cursor = 0;

  while (cursor < japanese.length) {
    let match: { index: number; word: StoryWord } | null = null;
    for (const word of candidates) {
      const index = japanese.indexOf(word.surface, cursor);
      if (index < 0) continue;
      if (
        match === null ||
        index < match.index ||
        (index === match.index && word.surface.length > match.word.surface.length)
      ) {
        match = { index, word };
      }
    }

    if (match === null) break;
    if (match.index > cursor) {
      segments.push({ text: japanese.slice(cursor, match.index) });
    }
    segments.push({ text: match.word.surface, word: match.word });
    cursor = match.index + match.word.surface.length;
  }

  if (cursor < japanese.length) {
    segments.push({ text: japanese.slice(cursor) });
  }
  return segments.length ? segments : [{ text: japanese }];
}

export function fallbackStoryWords(
  lineId: string,
  japanese: string,
  preferredTerms: string[],
  vocabulary: VocabularyItem[],
): StoryWord[] {
  const records = new Map<string, { reading: string; meaning: string }>();
  for (const [surface, support] of Object.entries(legacyStoryWordSupport)) {
    records.set(surface, support);
  }
  for (const item of vocabulary) {
    records.set(item.term, { reading: item.reading, meaning: item.meaning });
  }
  for (const surface of preferredTerms) {
    if (!records.has(surface)) {
      records.set(surface, { reading: surface, meaning: surface });
    }
  }

  const occurrences: Array<{
    index: number;
    surface: string;
    reading: string;
    meaning: string;
  }> = [];
  for (const [surface, support] of records) {
    let from = 0;
    while (from < japanese.length) {
      const index = japanese.indexOf(surface, from);
      if (index < 0) break;
      occurrences.push({ index, surface, ...support });
      from = index + Math.max(1, surface.length);
    }
  }

  occurrences.sort(
    (left, right) =>
      left.index - right.index || right.surface.length - left.surface.length,
  );
  const words: StoryWord[] = [];
  let occupiedUntil = 0;
  for (const occurrence of occurrences) {
    if (occurrence.index < occupiedUntil) continue;
    const position = words.length + 1;
    words.push({
      id: `fallback:${lineId}:${occurrence.index}:${occurrence.surface}`,
      position,
      surface: occurrence.surface,
      reading: occurrence.reading,
      meaning: occurrence.meaning,
      scriptType: storyWordScript(occurrence.surface),
      baseMeaningScore: 100,
      baseRecognitionScore: 100,
      basePronunciationScore: 100,
    });
    occupiedUntil = occurrence.index + occurrence.surface.length;
  }
  return words;
}

export function storyWordScores(
  interactions: StoryInteraction[],
  lineId: string,
  word: StoryWord,
): StoryWordScores {
  const evidence = interactions.filter(
    (item) =>
      item.lineId === lineId &&
      (item.wordId === word.id || (!item.wordId && item.term === word.surface)),
  );
  let meaning = word.baseMeaningScore;
  let recognition = word.baseRecognitionScore;
  let pronunciation = word.basePronunciationScore;

  for (const item of evidence) {
    const hasDimensions =
      item.meaningDelta !== undefined ||
      item.recognitionDelta !== undefined ||
      item.pronunciationDelta !== undefined;
    if (hasDimensions) {
      meaning += item.meaningDelta ?? 0;
      recognition += item.recognitionDelta ?? 0;
      pronunciation += item.pronunciationDelta ?? 0;
      continue;
    }

    if (item.type === "reading-revealed") {
      recognition -= STORY_RECOGNITION_PENALTY;
    }
    if (item.type === "meaning-revealed") {
      meaning -= STORY_MEANING_PENALTY;
      if (word.scriptType !== "kanji") {
        recognition -= STORY_MEANING_PENALTY;
      }
    }
  }

  return {
    meaning: clampScore(meaning),
    recognition: clampScore(recognition),
    pronunciation: clampScore(pronunciation),
  };
}

export function storyWordIndependence(
  interactions: StoryInteraction[],
  lineId: string,
  word: StoryWord,
): number {
  const scores = storyWordScores(interactions, lineId, word);
  return Math.round(
    (scores.meaning + scores.recognition + scores.pronunciation) / 3,
  );
}

export function storyTermScore(
  interactions: StoryInteraction[],
  lineId: string,
  term: string,
): number {
  const word: StoryWord = {
    id: `legacy:${lineId}:${term}`,
    position: 1,
    surface: term,
    reading: term,
    meaning: term,
    scriptType: storyWordScript(term),
    baseMeaningScore: 100,
    baseRecognitionScore: 100,
    basePronunciationScore: 100,
  };
  return storyWordIndependence(interactions, lineId, word);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&");
}

const legacyStoryWordSupport: Record<
  string,
  { reading: string; meaning: string }
> = {
  朝: { reading: "あさ", meaning: "morning" },
  ゆきさん: { reading: "ゆきさん", meaning: "Yuki" },
  は: { reading: "は", meaning: "topic marker" },
  六時半: { reading: "ろくじはん", meaning: "6:30" },
  に: { reading: "に", meaning: "at / to" },
  起きます: { reading: "おきます", meaning: "wake up" },
  最近: { reading: "さいきん", meaning: "recently" },
  早く: { reading: "はやく", meaning: "early" },
  起きられる: { reading: "おきられる", meaning: "can wake up" },
  ように: { reading: "ように", meaning: "so that / to the point that" },
  なりました: { reading: "なりました", meaning: "became" },
  コーヒー: { reading: "コーヒー", meaning: "coffee" },
  を: { reading: "を", meaning: "object marker" },
  飲み: { reading: "のみ", meaning: "drink" },
  ながら: { reading: "ながら", meaning: "while doing" },
  ニュース: { reading: "ニュース", meaning: "news" },
  読みます: { reading: "よみます", meaning: "read" },
  七時十五分: { reading: "しちじじゅうごふん", meaning: "7:15" },
  家: { reading: "いえ", meaning: "home" },
  出ます: { reading: "でます", meaning: "leave" },
  音楽: { reading: "おんがく", meaning: "music" },
  聞き: { reading: "きき", meaning: "listen" },
  駅: { reading: "えき", meaning: "station" },
  まで: { reading: "まで", meaning: "as far as" },
  歩きます: { reading: "あるきます", meaning: "walk" },
  改札: { reading: "かいさつ", meaning: "ticket gate" },
  で: { reading: "で", meaning: "at / by means of" },
  同僚: { reading: "どうりょう", meaning: "colleague" },
  の: { reading: "の", meaning: "possessive marker" },
  田中さん: { reading: "たなかさん", meaning: "Mr. Tanaka" },
  会います: { reading: "あいます", meaning: "meet" },
  二人: { reading: "ふたり", meaning: "two people" },
  一緒に: { reading: "いっしょに", meaning: "together" },
  電車: { reading: "でんしゃ", meaning: "train" },
  乗ります: { reading: "のります", meaning: "ride / board" },
  会社: { reading: "かいしゃ", meaning: "company" },
  から: { reading: "から", meaning: "from" },
  十分: { reading: "じゅっぷん", meaning: "ten minutes" },
  です: { reading: "です", meaning: "is / polite copula" },
  働いています: { reading: "はたらいています", meaning: "works" },
  新しい: { reading: "あたらしい", meaning: "new" },
  仕事: { reading: "しごと", meaning: "work" },
  も: { reading: "も", meaning: "also" },
  慣れる: { reading: "なれる", meaning: "get used to" },
};
