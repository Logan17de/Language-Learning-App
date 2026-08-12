import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerationAuditEntry } from "@/lib/gemini/lesson-engine-v2";
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

interface JishoJapanese {
  word?: string;
  reading?: string;
}

interface JishoSense {
  english_definitions?: string[];
  parts_of_speech?: string[];
}

interface JishoEntry {
  slug?: string;
  is_common?: boolean;
  japanese?: JishoJapanese[];
  senses?: JishoSense[];
  attribution?: { jmdict?: boolean };
}

interface JishoResponse {
  meta?: { status?: number };
  data?: JishoEntry[];
}

const JISHO_WORDS_ENDPOINT = "https://jisho.org/api/v1/search/words";
export const DICTIONARY_SOURCE_MODEL = "jisho-jmdict";
const LOOKUP_TIMEOUT_MS = 8_000;
const LOOKUP_CONCURRENCY = 4;
const MAX_LOOKUP_CANDIDATES = 100;
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
  "せる", "させ", "させる",
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
    for (let end = index + 1; end < Math.min(pieces.length, index + 4); end += 1) {
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

function isFunctionSense(parts: string[]): boolean {
  const joined = parts.join(" ").toLocaleLowerCase();
  return joined.includes("particle") ||
    joined.includes("auxiliary") ||
    joined.includes("copula") ||
    joined.includes("suffix") ||
    joined.includes("prefix");
}

function godanEnding(joined: string, ending: string): boolean {
  return joined.includes(`'${ending}' ending`) ||
    joined.includes(`\"${ending}\" ending`) ||
    joined.includes(`${ending} ending`);
}

export function jishoConjugationType(
  parts: string[],
  dictionaryForm: string,
): RawStoryVocabulary["conjugationType"] {
  const joined = parts.join(" ").toLocaleLowerCase();
  if (dictionaryForm === "ある") return "aru";
  if (joined.includes("ichidan verb")) return "ichidan";
  if (joined.includes("suru verb") || joined.includes("verb taking the aux. verb suru")) return "suru";
  if (joined.includes("kuru verb")) return "kuru";
  if (!joined.includes("godan verb")) return null;
  if (godanEnding(joined, "u")) return "godan-u";
  if (godanEnding(joined, "ku")) return "godan-ku";
  if (godanEnding(joined, "gu")) return "godan-gu";
  if (godanEnding(joined, "su")) return "godan-su";
  if (godanEnding(joined, "tsu")) return "godan-tsu";
  if (godanEnding(joined, "nu")) return "godan-nu";
  if (godanEnding(joined, "bu")) return "godan-bu";
  if (godanEnding(joined, "mu")) return "godan-mu";
  if (godanEnding(joined, "ru")) return "godan-ru";
  return null;
}

export function jishoPartOfSpeech(
  parts: string[],
  dictionaryForm: string,
): RawStoryVocabulary["partOfSpeech"] {
  const joined = parts.join(" ").toLocaleLowerCase();
  if (jishoConjugationType(parts, dictionaryForm)) return "verb";
  if (joined.includes("i-adjective")) return "i-adjective";
  if (joined.includes("na-adjective")) return "na-adjective";
  if (joined.includes("adverb")) return "adverb";
  if (joined.includes("expression")) return "expression";
  if (
    joined.includes("noun") ||
    joined.includes("pronoun") ||
    joined.includes("proper noun") ||
    joined.includes("counter")
  ) return "noun";
  return "other";
}

function commonPrefixLength(left: string, right: string): number {
  const maximum = Math.min(left.length, right.length);
  let index = 0;
  while (index < maximum && left[index] === right[index]) index += 1;
  return index;
}

function entryScore(entry: JishoEntry, surface: string): number {
  let score = entry.is_common ? 10 : 0;
  if (entry.attribution?.jmdict) score += 5;
  if (normalize(entry.slug ?? "") === surface) score += 100;
  for (const form of entry.japanese ?? []) {
    if (normalize(form.word ?? "") === surface) score = Math.max(score, 120);
    if (normalize(form.reading ?? "") === surface) score = Math.max(score, 110);
    const canonical = normalize(form.word ?? form.reading ?? "");
    if (canonical && commonPrefixLength(canonical, surface) >= 2) score += 20;
    else if (canonical && /\p{Script=Han}/u.test(canonical[0] ?? "") && canonical[0] === surface[0]) score += 8;
  }
  return score;
}

function selectJapaneseForm(entry: JishoEntry, surface: string): JishoJapanese | null {
  const forms = entry.japanese ?? [];
  return forms.find((form) => normalize(form.word ?? "") === surface) ??
    forms.find((form) => normalize(form.reading ?? "") === surface) ??
    forms.find((form) => Boolean(normalize(form.word ?? ""))) ??
    forms[0] ?? null;
}

function selectSense(entry: JishoEntry, context: ReadonlySet<string>): JishoSense | null {
  const senses = (entry.senses ?? []).filter((sense) =>
    (sense.english_definitions?.length ?? 0) > 0 && !isFunctionSense(sense.parts_of_speech ?? []),
  );
  if (senses.length < 1) return null;
  return [...senses].sort((left, right) =>
    definitionOverlap(right.english_definitions ?? [], context) -
    definitionOverlap(left.english_definitions ?? [], context),
  )[0] ?? null;
}

function dictionaryAliases(
  entry: JishoEntry,
  dictionaryForm: string,
  surface: string,
): string[] {
  return [...new Set([
    ...(entry.japanese ?? []).flatMap((form) => form.word ? [normalize(form.word)] : []),
    surface,
  ].filter((value) => value && value !== dictionaryForm))];
}

async function fetchJisho(surface: string): Promise<JishoResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${JISHO_WORDS_ENDPOINT}?keyword=${encodeURIComponent(surface)}`,
      {
        headers: {
          accept: "application/json",
          "user-agent": "AIko-Japanese/1.0 dictionary-vocabulary",
        },
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Japanese dictionary lookup failed with status ${response.status}.`);
    }
    const body = await response.json() as JishoResponse;
    if (typeof body.meta?.status === "number" && body.meta.status !== 200) {
      throw new Error(`Japanese dictionary lookup returned status ${body.meta.status}.`);
    }
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Japanese dictionary lookup timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupSurface(
  surface: string,
  context: ReadonlySet<string>,
): Promise<RawStoryVocabulary | null> {
  const response = await fetchJisho(surface);
  const entry = [...(response.data ?? [])]
    .filter((candidate) => candidate.attribution?.jmdict !== false)
    .sort((left, right) => entryScore(right, surface) - entryScore(left, surface))
    .find((candidate) => selectSense(candidate, context));
  if (!entry) return null;

  const form = selectJapaneseForm(entry, surface);
  const sense = selectSense(entry, context);
  if (!form || !sense) return null;
  const dictionaryForm = normalize(form.word ?? form.reading ?? entry.slug ?? "");
  const reading = normalize(form.reading ?? form.word ?? dictionaryForm);
  if (!dictionaryForm || !reading) return null;
  const parts = sense.parts_of_speech ?? [];
  if (isFunctionSense(parts)) return null;
  const mappedPart = jishoPartOfSpeech(parts, dictionaryForm);
  const mappedConjugation = jishoConjugationType(parts, dictionaryForm);
  if (mappedPart === "verb" && !mappedConjugation) return null;
  const meaning = (sense.english_definitions ?? []).slice(0, 3).join("; ").trim();
  if (!meaning) return null;

  return {
    word: surface,
    dictionaryForm,
    reading,
    meaning,
    partOfSpeech: mappedPart,
    conjugationType: mappedConjugation,
    aliases: dictionaryAliases(entry, dictionaryForm, surface),
    source: "JMdict",
    sourceEntry: normalize(entry.slug ?? dictionaryForm),
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return output;
}

function canonicalIdentity(item: RawStoryVocabulary): string {
  return `${item.dictionaryForm}\u001f${item.reading}\u001f${item.partOfSpeech}`;
}

export async function lookupJapaneseDictionaryVocabulary(input: {
  japanese: string;
  englishContext?: string;
}): Promise<RawStoryVocabulary[]> {
  const candidates = japaneseDictionaryCandidates(input.japanese);
  const context = contextWords(input.englishContext ?? "");
  const lookedUp = await mapWithConcurrency(
    candidates,
    LOOKUP_CONCURRENCY,
    (surface) => lookupSurface(surface, context),
  );
  const seenCanonical = new Set<string>();
  return lookedUp.flatMap((item) => {
    if (!item) return [];
    const identity = canonicalIdentity(item);
    if (seenCanonical.has(identity)) return [];
    seenCanonical.add(identity);
    return [item];
  });
}

/**
 * Deterministic story vocabulary indexing. Japanese text is segmented locally,
 * then candidate words are resolved through Jisho's JMdict-backed word API.
 * No model is called and no generated meaning is accepted into the library.
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
  const vocabulary = await lookupJapaneseDictionaryVocabulary({ japanese, englishContext });
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
