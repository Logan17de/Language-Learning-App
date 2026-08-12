import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
import {
  containsKanji,
  lookupSurface,
  type LexiconEntry,
  type PartOfSpeech,
  type VerbType,
} from "@/lib/japanese-lexicon";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StoryOnlyDraft } from "@/lib/gemini/story-pipeline-v3";
import type { Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

export interface RawStoryVocabulary {
  word: string;
  dictionaryForm: string;
  reading: string;
  meaning: string;
  partOfSpeech:
    | "noun"
    | "verb"
    | "i-adjective"
    | "na-adjective"
    | "adverb"
    | "expression"
    | "other";
  conjugationType:
    | "ichidan"
    | "godan-u"
    | "godan-ku"
    | "godan-gu"
    | "godan-su"
    | "godan-tsu"
    | "godan-nu"
    | "godan-bu"
    | "godan-mu"
    | "godan-ru"
    | "suru"
    | "kuru"
    | "aru"
    | null;
  aliases: string[];
  source: "JMdict";
  sourceEntry: string;
}

interface SegmentPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface LocalJmdictRow {
  entry_key: string;
  entry_seq: number;
  dictionary_form: string;
  reading: string;
  meaning: string;
  meanings: string[];
  part_of_speech: RawStoryVocabulary["partOfSpeech"];
  conjugation_type: RawStoryVocabulary["conjugationType"];
  aliases: string[];
  search_forms: string[];
  common: boolean;
  priority: number;
}

// Legacy runtime lookup removed: https://jisho.org/api/v1/search/words
// Legacy audit label removed: DICTIONARY_SOURCE_MODEL = "jisho-jmdict"
export const DICTIONARY_SOURCE_MODEL = "jmdict-local";
const MAX_LOOKUP_CANDIDATES = 100;
const MAX_DICTIONARY_ROWS = 750;
const MIN_REUSABLE_VOCABULARY = 8;

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const FUNCTION_WORDS = new Set([
  "は", "が", "を", "に", "へ", "で", "と", "の", "も", "や", "か",
  "から", "まで", "より", "しか", "だけ", "ほど", "など", "ね", "よ",
  "な", "って", "っていう", "という", "です", "だ", "ます", "まし", "た",
  "て", "でし", "でした", "ません", "ない", "なかっ", "れる", "られる",
  "せる", "させる",
]);
const INFLECTION_TAILS = new Set([
  "ます", "まし", "た", "て", "で", "ない", "なかっ", "ません", "ました",
  "です", "でし", "でした", "たい", "たく", "れる", "られ", "られる",
  "せる", "させ", "させる", "いる", "しまう", "しまった", "なければ",
]);
const ENGLISH_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
  "from", "had", "has", "have", "he", "her", "his", "i", "in", "is", "it",
  "its", "of", "on", "or", "she", "that", "the", "their", "them", "they",
  "this", "to", "was", "we", "were", "with", "you", "your",
]);

function segmenter(): { segment(value: string): Iterable<SegmentPart> } {
  const Constructor = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: "word" },
    ) => { segment(value: string): Iterable<SegmentPart> };
  }).Segmenter;
  if (!Constructor) throw new Error("The Japanese word segmenter is unavailable.");
  return new Constructor("ja", { granularity: "word" });
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim();
}

function isUsefulSurface(value: string): boolean {
  const normalized = normalize(value);
  return Boolean(normalized) &&
    JAPANESE.test(normalized) &&
    !FUNCTION_WORDS.has(normalized) &&
    !/^\p{Number}+$/u.test(normalized);
}

function lineCandidates(japanese: string): string[] {
  const pieces = [...segmenter().segment(japanese)]
    .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
    .map((part) => normalize(part.segment))
    .filter(Boolean);
  const ordinary: string[] = [];
  const inflected: string[] = [];

  for (let index = 0; index < pieces.length; index += 1) {
    const base = pieces[index]!;
    if (isUsefulSurface(base)) ordinary.push(base);

    let combined = base;
    for (let end = index + 1; end < Math.min(pieces.length, index + 5); end += 1) {
      const tail = pieces[end]!;
      if (!INFLECTION_TAILS.has(tail)) break;
      combined += tail;
      if (isUsefulSurface(combined)) inflected.push(combined);
    }
  }
  return [...inflected.reverse(), ...ordinary];
}

export function japaneseDictionaryCandidates(japanese: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const candidate of lineCandidates(japanese)) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    values.push(candidate);
    if (values.length >= MAX_LOOKUP_CANDIDATES) break;
  }
  return values;
}

export function storyDictionaryCandidates(draft: StoryOnlyDraft): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const line of draft.lines) {
    for (const candidate of japaneseDictionaryCandidates(line.japanese)) {
      if (seen.has(candidate)) continue;
      seen.add(candidate);
      values.push(candidate);
      if (values.length >= MAX_LOOKUP_CANDIDATES) return values;
    }
  }
  return values;
}

function contextWords(value: string): Set<string> {
  const words = value
    .toLocaleLowerCase()
    .match(/[a-z][a-z'-]+/gu) ?? [];
  return new Set(words.filter((word) => word.length > 2 && !ENGLISH_STOPWORDS.has(word)));
}

function definitionOverlap(definitions: string[], context: ReadonlySet<string>): number {
  const words = definitions
    .join(" ")
    .toLocaleLowerCase()
    .match(/[a-z][a-z'-]+/gu) ?? [];
  return words.reduce(
    (score, word) => score + (word.length > 2 && context.has(word) ? 1 : 0),
    0,
  );
}

function bestMeaning(row: LocalJmdictRow, context: ReadonlySet<string>): string {
  const meanings = row.meanings?.length ? row.meanings : [row.meaning];
  return [...meanings].sort(
    (left, right) => definitionOverlap([right], context) - definitionOverlap([left], context),
  )[0] ?? row.meaning;
}

function asLexiconEntry(row: LocalJmdictRow): LexiconEntry {
  const partOfSpeech = row.part_of_speech as PartOfSpeech;
  const conjugationType = row.conjugation_type as VerbType | null;
  return {
    id: row.entry_key,
    kanji: containsKanji(row.dictionary_form) ? row.dictionary_form : "",
    kana: row.reading,
    meaning: row.meaning,
    partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    aliases: row.aliases ?? [],
    source: "migration",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

function canonicalIdentity(item: RawStoryVocabulary): string {
  return `${item.dictionaryForm}\u001f${item.reading}\u001f${item.partOfSpeech}`;
}

function rowMatch(
  row: LocalJmdictRow,
  candidates: readonly string[],
  context: ReadonlySet<string>,
): { item: RawStoryVocabulary; surfaceIndex: number; score: number } | null {
  const entry = asLexiconEntry(row);
  for (let index = 0; index < candidates.length; index += 1) {
    const surface = candidates[index]!;
    const matches = lookupSurface([entry], surface);
    if (matches.length < 1) continue;
    const match = matches[0]!;
    const meaning = bestMeaning(row, context);
    return {
      surfaceIndex: index,
      score:
        1000 - index * 5 +
        (row.common ? 50 : 0) +
        Math.min(row.priority ?? 0, 100) +
        definitionOverlap([meaning], context) * 20,
      item: {
        word: surface,
        dictionaryForm: row.dictionary_form,
        reading: match.form.kana || row.reading,
        meaning,
        partOfSpeech: row.part_of_speech,
        conjugationType: row.conjugation_type,
        aliases: [...new Set([
          ...(row.aliases ?? []),
          ...(surface !== row.dictionary_form ? [surface] : []),
        ])],
        source: "JMdict",
        sourceEntry: row.entry_key,
      },
    };
  }
  return null;
}

export async function lookupJapaneseDictionaryVocabulary(input: {
  japanese: string;
  englishContext?: string;
  admin?: SupabaseClient;
}): Promise<RawStoryVocabulary[]> {
  const candidates = japaneseDictionaryCandidates(input.japanese);
  if (candidates.length < 1) return [];
  const admin = input.admin ?? (createAdminClient() as unknown as SupabaseClient);
  const result = await admin.rpc("lookup_jmdict_vocabulary", {
    p_surfaces: candidates,
    p_limit: MAX_DICTIONARY_ROWS,
  });
  if (result.error) {
    const error = new Error(`Local JMdict lookup failed: ${result.error.message}`) as Error & { code?: string };
    error.code = result.error.code;
    throw error;
  }
  const rows = (result.data ?? []) as LocalJmdictRow[];
  if (rows.length < 1) {
    throw new Error(
      "Local JMdict dictionary is empty or has no matching forms. Run npm run jmdict:import after applying the JMdict migration.",
    );
  }

  const context = contextWords(input.englishContext ?? "");
  const matches = rows
    .map((row) => rowMatch(row, candidates, context))
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .sort((left, right) => right.score - left.score || left.surfaceIndex - right.surfaceIndex);

  const seenSurface = new Set<string>();
  const seenCanonical = new Set<string>();
  const vocabulary: RawStoryVocabulary[] = [];
  for (const match of matches) {
    const identity = canonicalIdentity(match.item);
    if (seenSurface.has(match.item.word) || seenCanonical.has(identity)) continue;
    seenSurface.add(match.item.word);
    seenCanonical.add(identity);
    vocabulary.push(match.item);
  }
  return vocabulary;
}

/**
 * Deterministic story vocabulary indexing. Japanese text is segmented locally,
 * then all candidate forms are resolved in one Supabase call against a local
 * JMdict import. No model and no public dictionary HTTP API is used at runtime.
 */
export async function enrichGeneratedStoryVocabulary(input: {
  admin: SupabaseClient;
  requestId: string;
  level: JLPTLevel;
  draft: StoryOnlyDraft;
}): Promise<{
  vocabulary: RawStoryVocabulary[];
  audit: GenerationAuditEntry;
}> {
  const japanese = input.draft.lines.map((line) => line.japanese).join("\n");
  const englishContext = input.draft.lines.map((line) => line.english).join(" ");
  const vocabulary = await lookupJapaneseDictionaryVocabulary({
    japanese,
    englishContext,
    admin: input.admin,
  });
  if (vocabulary.length < MIN_REUSABLE_VOCABULARY) {
    throw new Error(
      `Story vocabulary dictionary lookup produced only ${vocabulary.length} reusable entries; at least ${MIN_REUSABLE_VOCABULARY} are required.`,
    );
  }

  const stored = await input.admin.rpc("store_story_vocabulary_enrichment", {
    p_request_id: input.requestId,
    p_level: input.level,
    p_vocabulary: vocabulary as unknown as Json,
    p_source_model: DICTIONARY_SOURCE_MODEL,
  });
  if (stored.error) {
    const error = new Error(`Dictionary story vocabulary could not be stored: ${stored.error.message}`) as Error & { code?: string };
    error.code = stored.error.code;
    throw error;
  }

  return {
    vocabulary,
    audit: {
      stage: "library",
      model: DICTIONARY_SOURCE_MODEL,
      repaired: false,
    },
  };
}
