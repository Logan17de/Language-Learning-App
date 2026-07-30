import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateStructured,
  type JsonSchema,
} from "@/lib/gemini/structured-output";
import {
  STORY_CONTENT_PARTS,
  lexicalTermIssues,
  type LexicalDraftTerm,
} from "@/lib/gemini/story-lexicon-validation";
import {
  FORM_CODES,
  SUPPORTED_VERB_TRANSFORMATION_CHAINS,
  VERB_TYPES,
  canonicalSurface,
  composeEntryForm,
  containsKanji,
  lookupSurface,
  normalizeJapanese,
  type FormCode,
  type FormOverrides,
  type GeneratedForm,
  type LexiconEntry,
  type PartOfSpeech,
  type VerbType,
} from "@/lib/japanese-lexicon";
import { storyWordScript } from "@/lib/story-support";
import type {
  CanonicalGrammar,
  CanonicalKanji,
  CanonicalVocabulary,
  GenerationAuditEntry,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import type {
  LessonPlanV3,
  StoryOnlyDraft,
} from "@/lib/gemini/story-pipeline-v3";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

type KanjiRow = Database["public"]["Tables"]["kanji_records"]["Row"];
type GrammarRow = Database["public"]["Tables"]["grammar_records"]["Row"];
type VocabularyRow = Database["public"]["Tables"]["vocabulary_records"]["Row"] & {
  dictionary_form: string;
  conjugation_type: string | null;
  aliases: string[];
  form_overrides: Json;
  lexicon_schema_version: number;
};

interface SegmentPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface RegionPiece {
  text: string;
  start: number;
  end: number;
}

interface LexicalRegion {
  lineIndex: number;
  pieces: RegionPiece[];
}

interface FormMatch {
  row: VocabularyRow;
  entry: LexiconEntry;
  form: GeneratedForm;
  matchedSpelling: string;
  matchedThroughAlias: boolean;
}

interface Morphology {
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: PartOfSpeech;
  conjugationType?: VerbType;
  dictionaryAlias: string;
}

interface KnownOccurrence {
  kind: "known";
  lineIndex: number;
  start: number;
  end: number;
  surface: string;
  match: FormMatch;
}

interface MissingSpan {
  kind: "missing";
  requestIndex: number;
  lineIndex: number;
  start: number;
  end: number;
  surface: string;
  contextJapanese: string;
  contextEnglish: string;
  expected?: Morphology;
}

interface RawKanjiDetail {
  character: string;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

interface RawMissingTerm extends LexicalDraftTerm {
  meaning: string;
  tags: string[];
  exampleSentence: string;
  kanjiDetails: RawKanjiDetail[];
}

interface RawMissingResult {
  requestIndex: number;
  terms: RawMissingTerm[];
}

interface RawMissingWordEnrichment {
  results: RawMissingResult[];
}

interface EnrichedOccurrence {
  kind: "enriched";
  lineIndex: number;
  start: number;
  end: number;
  surface: string;
  term: RawMissingTerm;
  morphology: Morphology;
}

interface VocabularyRequest extends Morphology {
  meaning: string;
  tags: string[];
  exampleSentence: string;
  observedSurfaces: string[];
}

const PARTICLE_BOUNDARIES = new Set([
  "は",
  "が",
  "を",
  "に",
  "へ",
  "で",
  "と",
  "の",
  "も",
  "や",
  "か",
  "から",
  "まで",
  "より",
  "しか",
  "だけ",
  "ほど",
  "など",
  "ね",
  "よ",
  "ぞ",
  "さ",
]);

const AUXILIARY_LIKE = new Set([
  "ま",
  "ます",
  "ませ",
  "ません",
  "ました",
  "です",
  "でした",
  "だ",
  "だった",
  "ない",
  "なかった",
  "て",
  "で",
  "いる",
  "いた",
  "れる",
  "られる",
  "せる",
  "させる",
  "たい",
  "ちゃ",
  "じゃ",
  "っ",
  "た",
  "した",
  "しま",
]);

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function chunks<T>(items: T[], size = 100): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function japaneseSegmenter(): {
  segment(value: string): Iterable<SegmentPart>;
} {
  const constructor = (Intl as unknown as {
    Segmenter?: new (
      locale: string,
      options: { granularity: "word" },
    ) => { segment(value: string): Iterable<SegmentPart> };
  }).Segmenter;
  if (!constructor) {
    throw new Error("The Japanese word segmenter is unavailable in this runtime.");
  }
  return new constructor("ja", { granularity: "word" });
}

function lexicalRegions(draft: StoryOnlyDraft): LexicalRegion[] {
  const segmenter = japaneseSegmenter();
  const regions: LexicalRegion[] = [];

  draft.lines.forEach((line, lineIndex) => {
    let pieces: RegionPiece[] = [];
    const flush = () => {
      if (pieces.length > 0) regions.push({ lineIndex, pieces });
      pieces = [];
    };

    for (const part of segmenter.segment(line.japanese)) {
      const value = part.segment;
      const start = part.index;
      const end = start + value.length;
      if (value === "・" && pieces.length > 0) {
        pieces.push({ text: value, start, end });
        continue;
      }
      if (!part.isWordLike || !JAPANESE.test(value)) {
        flush();
        continue;
      }
      if (PARTICLE_BOUNDARIES.has(value)) {
        flush();
        continue;
      }
      pieces.push({ text: value, start, end });
    }
    flush();
  });

  return regions;
}

function querySurfaces(regions: LexicalRegion[]): string[] {
  const values = new Set<string>();
  for (const region of regions) {
    for (const piece of region.pieces) {
      if (piece.text !== "・") values.add(normalizeJapanese(piece.text));
    }
    for (let start = 0; start < region.pieces.length; start += 1) {
      let combined = "";
      for (
        let end = start;
        end < Math.min(region.pieces.length, start + 8);
        end += 1
      ) {
        combined += region.pieces[end]!.text;
        const normalized = normalizeJapanese(combined);
        if (normalized && normalized.length <= 40) values.add(normalized);
      }
    }
  }
  return [...values].slice(0, 600);
}

function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return (
    typeof value === "string" &&
    (STORY_CONTENT_PARTS as readonly string[]).includes(value)
  );
}

function isVerbType(value: unknown): value is VerbType {
  return (
    typeof value === "string" &&
    (VERB_TYPES as readonly string[]).includes(value)
  );
}

function formOverrides(value: Json): FormOverrides | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as FormOverrides)
    : undefined;
}

function sourceFor(row: VocabularyRow): LexiconEntry["source"] {
  if (row.source_type === "ai_enriched") return "gemini";
  if (row.source_type === "curated") return "manual";
  if (row.source_type === "imported") return "migration";
  return "seed";
}

function lexiconEntry(row: VocabularyRow): LexiconEntry {
  const dictionaryForm = normalizeJapanese(
    row.dictionary_form || row.written_form,
  );
  const partOfSpeech = isPartOfSpeech(row.part_of_speech)
    ? row.part_of_speech
    : "other";
  const conjugationType = isVerbType(row.conjugation_type)
    ? row.conjugation_type
    : undefined;
  const overrides = formOverrides(row.form_overrides);
  return {
    id: row.id,
    kanji: containsKanji(dictionaryForm) ? dictionaryForm : "",
    kana: normalizeJapanese(row.reading),
    meaning: row.meaning,
    partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    aliases: (row.aliases ?? []).map(normalizeJapanese).filter(Boolean),
    ...(overrides ? { formOverrides: overrides } : {}),
    source: sourceFor(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function entryForSpelling(entry: LexiconEntry, spelling: string): LexiconEntry {
  const normalized = normalizeJapanese(spelling);
  return containsKanji(normalized)
    ? { ...entry, kanji: normalized, aliases: [] }
    : { ...entry, kanji: "", kana: normalized, aliases: [] };
}

function supportedChains(entry: LexiconEntry): FormCode[][] {
  if (entry.partOfSpeech === "verb") {
    return SUPPORTED_VERB_TRANSFORMATION_CHAINS.map((item) => [...item]);
  }
  return [
    [],
    ...FORM_CODES.filter((code) => code !== "dictionary").map(
      (code) => [code] as FormCode[],
    ),
  ];
}

function buildFormIndex(rows: VocabularyRow[]): Map<string, FormMatch[]> {
  const index = new Map<string, FormMatch[]>();
  const add = (surface: string, match: FormMatch) => {
    const normalized = normalizeJapanese(surface);
    if (!normalized || PARTICLE_BOUNDARIES.has(normalized)) return;
    const current = index.get(normalized) ?? [];
    const key = `${match.row.id}\u0000${match.form.transformations.join("|")}\u0000${match.matchedSpelling}`;
    if (
      !current.some(
        (item) =>
          `${item.row.id}\u0000${item.form.transformations.join("|")}\u0000${item.matchedSpelling}` === key,
      )
    ) {
      current.push(match);
      index.set(normalized, current);
    }
  };

  for (const row of rows) {
    const canonical = lexiconEntry(row);
    const spellings = [
      { value: canonicalSurface(canonical.kanji, canonical.kana), alias: false },
      ...canonical.aliases.map((value) => ({ value, alias: true })),
    ];
    for (const spelling of spellings) {
      const entry = entryForSpelling(canonical, spelling.value);
      for (const chain of supportedChains(entry)) {
        let form: GeneratedForm | null = null;
        try {
          form = composeEntryForm(entry, chain);
        } catch {
          form = null;
        }
        if (!form) continue;
        const match: FormMatch = {
          row,
          entry: canonical,
          form,
          matchedSpelling: normalizeJapanese(spelling.value),
          matchedThroughAlias: spelling.alias,
        };
        add(form.surface, match);
        add(form.kana, match);
      }
    }
  }
  return index;
}

function uniqueMatch(
  index: Map<string, FormMatch[]>,
  surface: string,
): FormMatch | null {
  const matches = index.get(normalizeJapanese(surface)) ?? [];
  const entryIds = [...new Set(matches.map((item) => item.row.id))];
  return entryIds.length === 1
    ? matches.find((item) => item.row.id === entryIds[0]) ?? null
    : null;
}

function trailingPiecesAreAuxiliary(
  pieces: RegionPiece[],
  start: number,
): boolean {
  if (start >= pieces.length) return false;
  return pieces
    .slice(start)
    .filter((item) => item.text !== "・")
    .every((item) => AUXILIARY_LIKE.has(item.text));
}

function knownAt(
  region: LexicalRegion,
  start: number,
  index: Map<string, FormMatch[]>,
): { end: number; surface: string; match: FormMatch } | null {
  for (let end = region.pieces.length; end > start; end -= 1) {
    const surface = region.pieces
      .slice(start, end)
      .map((item) => item.text)
      .join("");
    const match = uniqueMatch(index, surface);
    if (!match) continue;
    if (end < region.pieces.length && trailingPiecesAreAuxiliary(region.pieces, end)) {
      continue;
    }
    return { end, surface, match };
  }
  return null;
}

function morphologyFromMatch(match: FormMatch): Morphology {
  return {
    dictionaryForm: canonicalSurface(match.entry.kanji, match.entry.kana),
    dictionaryReading: match.entry.kana,
    partOfSpeech: match.entry.partOfSpeech,
    ...(match.entry.conjugationType
      ? { conjugationType: match.entry.conjugationType }
      : {}),
    dictionaryAlias: match.matchedThroughAlias ? match.matchedSpelling : "",
  };
}

function resolveRegions(
  draft: StoryOnlyDraft,
  regions: LexicalRegion[],
  formIndex: Map<string, FormMatch[]>,
  knownKanji: Set<string>,
): { known: KnownOccurrence[]; missing: MissingSpan[] } {
  const known: KnownOccurrence[] = [];
  const missing: MissingSpan[] = [];

  for (const region of regions) {
    let cursor = 0;
    while (cursor < region.pieces.length) {
      const found = knownAt(region, cursor, formIndex);
      if (found) {
        const first = region.pieces[cursor]!;
        const last = region.pieces[found.end - 1]!;
        const characters = found.surface.match(/\p{Script=Han}/gu) ?? [];
        if (characters.every((character) => knownKanji.has(character))) {
          known.push({
            kind: "known",
            lineIndex: region.lineIndex,
            start: first.start,
            end: last.end,
            surface: found.surface,
            match: found.match,
          });
        } else {
          const line = draft.lines[region.lineIndex]!;
          missing.push({
            kind: "missing",
            requestIndex: -1,
            lineIndex: region.lineIndex,
            start: first.start,
            end: last.end,
            surface: found.surface,
            contextJapanese: line.japanese,
            contextEnglish: line.english,
            expected: morphologyFromMatch(found.match),
          });
        }
        cursor = found.end;
        continue;
      }

      const start = cursor;
      cursor += 1;
      while (cursor < region.pieces.length && !knownAt(region, cursor, formIndex)) {
        cursor += 1;
      }
      const selected = region.pieces.slice(start, cursor);
      const surface = selected.map((item) => item.text).join("");
      if (!surface || surface === "・" || !JAPANESE.test(surface)) continue;
      const line = draft.lines[region.lineIndex]!;
      missing.push({
        kind: "missing",
        requestIndex: -1,
        lineIndex: region.lineIndex,
        start: selected[0]!.start,
        end: selected[selected.length - 1]!.end,
        surface,
        contextJapanese: line.japanese,
        contextEnglish: line.english,
      });
    }
  }

  const normalizedMissing = missing
    .filter((item) => !PARTICLE_BOUNDARIES.has(normalizeJapanese(item.surface)))
    .map((item, requestIndex) => ({ ...item, requestIndex }));
  return { known, missing: normalizedMissing };
}

async function loadKanjiAndGrammar(
  characters: string[],
  patterns: string[],
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[] }> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const [kanji, grammar] = await Promise.all([
    characters.length > 0
      ? admin
          .from("kanji_records")
          .select("*")
          .in("character", characters)
          .is("archived_at", null)
          .neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as KanjiRow[], error: null }),
    patterns.length > 0
      ? admin
          .from("grammar_records")
          .select("*")
          .in("pattern", patterns)
          .is("archived_at", null)
          .neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as GrammarRow[], error: null }),
  ]);
  const error = kanji.error ?? grammar.error;
  if (error) throw new Error(`Language library could not be loaded: ${error.message}`);
  return {
    kanji: (kanji.data ?? []) as KanjiRow[],
    grammar: (grammar.data ?? []) as GrammarRow[],
  };
}

async function loadVocabularyCandidates(
  surfaces: string[],
  linkedKanjiIds: string[],
): Promise<VocabularyRow[]> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const queries: Array<PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>> = [];
  for (const group of chunks(surfaces, 80)) {
    queries.push(
      admin
        .from("vocabulary_records")
        .select("*")
        .in("dictionary_form", group)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
      admin
        .from("vocabulary_records")
        .select("*")
        .in("written_form", group)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
      admin
        .from("vocabulary_records")
        .select("*")
        .overlaps("aliases", group)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
    );
  }
  if (linkedKanjiIds.length > 0) {
    queries.push(
      admin
        .from("vocabulary_records")
        .select("*")
        .overlaps("linked_kanji_ids", linkedKanjiIds)
        .is("archived_at", null)
        .neq("quality_status", "rejected")
        .limit(5000),
    );
  }
  const results = await Promise.all(queries);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Vocabulary preflight failed: ${error.message}`);
  return uniqueBy(
    results.flatMap((result) => (result.data ?? []) as VocabularyRow[]),
    (row) => row.id,
  );
}

async function loadVocabularyByForms(
  dictionaryForms: string[],
): Promise<VocabularyRow[]> {
  if (dictionaryForms.length < 1) return [];
  const admin = createAdminClient() as unknown as SupabaseClient;
  const results = await Promise.all(
    chunks([...new Set(dictionaryForms)], 80).map((group) =>
      admin
        .from("vocabulary_records")
        .select("*")
        .in("dictionary_form", group)
        .is("archived_at", null)
        .neq("quality_status", "rejected"),
    ),
  );
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Vocabulary library could not be loaded: ${error.message}`);
  return uniqueBy(
    results.flatMap((result) => (result.data ?? []) as VocabularyRow[]),
    (row) => row.id,
  );
}

function stringArray(minItems = 0, maxItems = 20): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
  };
}

function missingWordSchema(requestCount: number): JsonSchema {
  const kanjiDetail: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "character",
      "meanings",
      "readings",
      "onyomi",
      "kunyomi",
      "exampleWords",
      "strokeCount",
    ],
    properties: {
      character: { type: "string" },
      meanings: stringArray(1, 6),
      readings: stringArray(1, 12),
      onyomi: stringArray(0, 8),
      kunyomi: stringArray(0, 8),
      exampleWords: stringArray(1, 8),
      strokeCount: { type: "integer" },
    },
  };
  const term: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "surface",
      "readingHint",
      "dictionaryForm",
      "dictionaryReading",
      "partOfSpeech",
      "conjugationType",
      "dictionaryAlias",
      "meaning",
      "tags",
      "exampleSentence",
      "kanjiDetails",
    ],
    properties: {
      surface: { type: "string" },
      readingHint: { type: "string" },
      dictionaryForm: { type: "string" },
      dictionaryReading: { type: "string" },
      partOfSpeech: { type: "string", enum: [...STORY_CONTENT_PARTS] },
      conjugationType: { type: "string", enum: ["", ...VERB_TYPES] },
      dictionaryAlias: { type: "string" },
      meaning: { type: "string" },
      tags: stringArray(0, 8),
      exampleSentence: { type: "string" },
      kanjiDetails: {
        type: "array",
        minItems: 0,
        maxItems: 12,
        items: kanjiDetail,
      },
    },
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["results"],
    properties: {
      results: {
        type: "array",
        minItems: requestCount,
        maxItems: requestCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["requestIndex", "terms"],
          properties: {
            requestIndex: { type: "integer" },
            terms: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: term,
            },
          },
        },
      },
    },
  };
}

function morphologyForTerm(term: RawMissingTerm): Morphology {
  const dictionaryForm = normalizeJapanese(term.dictionaryForm);
  const dictionaryReading = normalizeJapanese(term.dictionaryReading);
  const dictionaryAlias = normalizeJapanese(term.dictionaryAlias);
  if (!dictionaryForm || !dictionaryReading || !isPartOfSpeech(term.partOfSpeech)) {
    throw new Error(`Missing word ${term.surface} has invalid canonical morphology.`);
  }
  const conjugationType = isVerbType(term.conjugationType)
    ? term.conjugationType
    : undefined;
  if (term.partOfSpeech === "verb" && !conjugationType) {
    throw new Error(`Missing verb ${term.surface} has no conjugation class.`);
  }
  return {
    dictionaryForm,
    dictionaryReading,
    partOfSpeech: term.partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    dictionaryAlias,
  };
}

function morphologyKey(value: Morphology): string {
  return [
    value.dictionaryForm,
    value.dictionaryReading,
    value.partOfSpeech,
  ].join("\u0000");
}

function missingWordIssues(
  value: unknown,
  requests: MissingSpan[],
  existingKanji: Set<string>,
): string[] {
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return ["Missing-word enrichment must contain results."];
  }
  const issues: string[] = [];
  if (value.results.length !== requests.length) {
    issues.push(`Results must contain exactly ${requests.length} items.`);
  }
  const seen = new Set<number>();

  for (const rawResult of value.results) {
    if (!isRecord(rawResult) || !Number.isInteger(rawResult.requestIndex)) {
      issues.push("Every result needs a valid requestIndex.");
      continue;
    }
    const requestIndex = Number(rawResult.requestIndex);
    const request = requests[requestIndex];
    if (!request || seen.has(requestIndex)) {
      issues.push(`Invalid or duplicate requestIndex ${requestIndex}.`);
      continue;
    }
    seen.add(requestIndex);
    if (!Array.isArray(rawResult.terms) || rawResult.terms.length < 1) {
      issues.push(`Request ${requestIndex} needs at least one lexical term.`);
      continue;
    }

    let cursor = 0;
    const coveredKanji = new Set<string>();
    rawResult.terms.forEach((candidate, termIndex) => {
      const label = `Request ${requestIndex}, term ${termIndex + 1}`;
      if (!isRecord(candidate)) {
        issues.push(`${label} must be an object.`);
        return;
      }
      const term = candidate as unknown as RawMissingTerm;
      const position = request.surface.indexOf(term.surface, cursor);
      if (position < 0) {
        issues.push(`${label} is missing or out of order inside the requested word span.`);
      } else {
        cursor = position + term.surface.length;
      }
      const lexical: LexicalDraftTerm = {
        surface: term.surface,
        readingHint: term.readingHint,
        scriptType: storyWordScript(term.surface),
        dictionaryForm: term.dictionaryForm,
        dictionaryReading: term.dictionaryReading,
        partOfSpeech: term.partOfSpeech,
        conjugationType: term.conjugationType,
        dictionaryAlias: term.dictionaryAlias,
      };
      issues.push(...lexicalTermIssues(lexical, label));
      term.readingHint = lexical.readingHint;
      if (!text(term.meaning)) issues.push(`${label} needs a concise English meaning.`);
      if (!Array.isArray(term.tags) || !term.tags.every((item) => typeof item === "string")) {
        issues.push(`${label} tags must be strings.`);
      }
      if (!text(term.exampleSentence)) {
        issues.push(`${label} needs a natural Japanese example sentence.`);
      }
      if (!Array.isArray(term.kanjiDetails)) {
        issues.push(`${label} kanjiDetails must be an array.`);
        return;
      }
      const detailCharacters = new Set<string>();
      for (const detail of term.kanjiDetails) {
        if (!isRecord(detail) || typeof detail.character !== "string") {
          issues.push(`${label} has an invalid kanji detail.`);
          continue;
        }
        if (detailCharacters.has(detail.character)) {
          issues.push(`${label} repeats kanji detail ${detail.character}.`);
        }
        detailCharacters.add(detail.character);
        if (!term.surface.includes(detail.character)) {
          issues.push(`${label} contains unrelated kanji detail ${detail.character}.`);
        }
      }
      for (const character of term.surface.match(/\p{Script=Han}/gu) ?? []) {
        coveredKanji.add(character);
        if (!existingKanji.has(character) && !detailCharacters.has(character)) {
          issues.push(`${label} must fully describe missing kanji ${character}.`);
        }
      }
    });

    for (const character of request.surface.match(/\p{Script=Han}/gu) ?? []) {
      if (!coveredKanji.has(character)) {
        issues.push(`Request ${requestIndex} does not cover kanji ${character}.`);
      }
    }
    if (request.expected) {
      if (rawResult.terms.length !== 1) {
        issues.push(`Request ${requestIndex} must preserve its one known lexical word.`);
      } else {
        const term = rawResult.terms[0] as unknown as RawMissingTerm;
        const actual = morphologyForTerm(term);
        if (morphologyKey(actual) !== morphologyKey(request.expected)) {
          issues.push(`Request ${requestIndex} changed an existing canonical word.`);
        }
        if (
          normalizeJapanese(actual.dictionaryAlias) !==
          normalizeJapanese(request.expected.dictionaryAlias)
        ) {
          issues.push(`Request ${requestIndex} changed the existing spelling alias.`);
        }
      }
    }
  }

  if (seen.size !== requests.length) {
    issues.push(`requestIndex must cover 0-${Math.max(0, requests.length - 1)} exactly once.`);
  }
  return [...new Set(issues)];
}

function missingWordPrompt(
  level: JLPTLevel,
  requests: MissingSpan[],
  existingKanji: Set<string>,
): string {
  return [
    "This is AIko API call 2: complete permanent library records only for unresolved Japanese words.",
    "Do not generate, rewrite, summarize, or return the story. The complete story is deliberately not included.",
    `JLPT ceiling: ${level}.`,
    "Each request contains one unresolved word span and only its local sentence context for disambiguation.",
    "For each request, return the reusable content word or words that occur inside that exact span, in occurrence order.",
    "Exclude punctuation, standalone particles, and standalone auxiliaries.",
    "For every returned word, fill the complete permanent library record: exact observed reading, canonical dictionary form and reading, part of speech, exact verb class, genuine spelling alias, concise English meaning, tags, and a natural example sentence.",
    "kanjiDetails must fully describe only kanji that are not already present in the library. Never add unrelated characters.",
    "Do not use an inflected form as dictionaryForm. Do not use synonyms or related words as aliases.",
    `Kanji already present in the library: ${JSON.stringify([...existingKanji])}`,
    `Missing word requests: ${JSON.stringify(
      requests.map((request) => ({
        requestIndex: request.requestIndex,
        surface: request.surface,
        contextJapanese: request.contextJapanese,
        contextEnglish: request.contextEnglish,
        ...(request.expected
          ? {
              expectedCanonicalWord: {
                dictionaryForm: request.expected.dictionaryForm,
                dictionaryReading: request.expected.dictionaryReading,
                partOfSpeech: request.expected.partOfSpeech,
                conjugationType: request.expected.conjugationType ?? "",
                dictionaryAlias: request.expected.dictionaryAlias,
              },
            }
          : {}),
      })),
    )}`,
  ].join("\n");
}

function matchingVocabularyRow(
  rows: VocabularyRow[],
  morphology: Morphology,
): VocabularyRow | null {
  return (
    rows.find(
      (row) =>
        normalizeJapanese(row.dictionary_form || row.written_form) ===
          morphology.dictionaryForm &&
        normalizeJapanese(row.reading) === morphology.dictionaryReading &&
        row.part_of_speech === morphology.partOfSpeech,
    ) ?? null
  );
}

function linkedKanjiCharacters(
  dictionaryForm: string,
  storyCharacters: string[],
): string[] {
  const allowed = new Set(storyCharacters);
  return [...new Set(dictionaryForm.match(/\p{Script=Han}/gu) ?? [])].filter(
    (character) => allowed.has(character),
  );
}

function canonicalKanji(row: KanjiRow): CanonicalKanji {
  return {
    libraryId: row.id,
    character: row.character,
    level: row.jlpt_level,
    meanings: row.meanings,
    readings: row.readings,
    onyomi: row.onyomi,
    kunyomi: row.kunyomi,
    exampleWords: row.example_words,
    strokeCount: row.stroke_count,
  };
}

function canonicalGrammar(row: GrammarRow): CanonicalGrammar {
  return {
    libraryId: row.id,
    pattern: row.pattern,
    level: row.jlpt_level,
    meaning: row.meaning,
    formation: row.formation,
    usageNotes: row.usage_notes,
    nuance: row.nuance,
    examples: row.example_sentences,
  };
}

function canonicalVocabulary(
  row: VocabularyRow,
  surface: string,
  reading: string,
): CanonicalVocabulary {
  return {
    libraryId: row.id,
    term: surface,
    reading,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech,
    level: row.jlpt_level,
    tags: row.tags,
    exampleSentence: row.example_sentence,
    linkedKanjiIds: row.linked_kanji_ids,
  };
}

function resolveFinalOccurrence(
  row: VocabularyRow,
  surface: string,
  morphology: Morphology,
): { reading: string } {
  const entry = lexiconEntry(row);
  const candidates = lookupSurface([entry], surface).filter((candidate) =>
    morphology.dictionaryAlias
      ? candidate.matchedThroughAlias &&
        candidate.matchedSpelling === morphology.dictionaryAlias
      : !candidate.matchedThroughAlias,
  );
  if (candidates.length < 1) {
    throw new Error(
      `${surface} cannot be reproduced from ${canonicalSurface(entry.kanji, entry.kana)}.`,
    );
  }
  return { reading: candidates[0]!.form.kana };
}

/**
 * Resolves all story words locally against the permanent lexicon first.
 * Gemini call 2 is skipped when every lexical item is already available.
 * When unresolved items remain, the model receives only those word spans and
 * one local sentence of context per span; it never receives the whole story.
 */
export async function resolveStoryLibraryV4(
  client: SupabaseClient<Database>,
  input: {
    level: JLPTLevel;
    plan: LessonPlanV3;
    draft: StoryOnlyDraft;
  },
): Promise<{
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  audits: GenerationAuditEntry[];
}> {
  const characters = uniqueBy(
    input.draft.lines.flatMap(
      (line) => line.japanese.match(/\p{Script=Han}/gu) ?? [],
    ),
    (item) => item,
  );
  const patterns = input.plan.grammar.map((item) => item.pattern);
  let records = await loadKanjiAndGrammar(characters, patterns);
  const missingGrammar = input.plan.grammar.filter(
    (target) =>
      !records.grammar.some(
        (row) => row.pattern === target.pattern && row.jlpt_level === target.level,
      ),
  );
  if (missingGrammar.length > 0) {
    throw new Error(
      `Import the ${input.level} grammar records before generating lessons.`,
    );
  }

  const regions = lexicalRegions(input.draft);
  const surfaces = querySurfaces(regions);
  const candidateRows = await loadVocabularyCandidates(
    surfaces,
    records.kanji.map((row) => row.id),
  );
  const formIndex = buildFormIndex(candidateRows);
  const existingKanji = new Set(records.kanji.map((row) => row.character));
  const preflight = resolveRegions(
    input.draft,
    regions,
    formIndex,
    existingKanji,
  );

  let generated: Awaited<ReturnType<typeof generateStructured<RawMissingWordEnrichment>>> | null = null;
  let enrichedOccurrences: EnrichedOccurrence[] = [];
  let vocabularyRows = candidateRows;

  if (preflight.missing.length > 0) {
    generated = await generateStructured<RawMissingWordEnrichment>({
      name: "missing-word library enrichment",
      prompt: missingWordPrompt(input.level, preflight.missing, existingKanji),
      schema: missingWordSchema(preflight.missing.length),
      validate: (value) =>
        missingWordIssues(value, preflight.missing, existingKanji),
    });

    const resultByIndex = new Map(
      generated.value.results.map((result) => [result.requestIndex, result]),
    );
    for (const request of preflight.missing) {
      const result = resultByIndex.get(request.requestIndex);
      if (!result) throw new Error(`Missing enrichment result ${request.requestIndex}.`);
      let localCursor = 0;
      for (const term of result.terms) {
        const localStart = request.surface.indexOf(term.surface, localCursor);
        if (localStart < 0) {
          throw new Error(`Enriched word ${term.surface} is outside its requested span.`);
        }
        localCursor = localStart + term.surface.length;
        enrichedOccurrences.push({
          kind: "enriched",
          lineIndex: request.lineIndex,
          start: request.start + localStart,
          end: request.start + localStart + term.surface.length,
          surface: normalizeJapanese(term.surface),
          term,
          morphology: morphologyForTerm(term),
        });
      }
    }

    const vocabularyRequests: VocabularyRequest[] = uniqueBy(
      enrichedOccurrences.map((occurrence) => ({
        ...occurrence.morphology,
        meaning: occurrence.term.meaning,
        tags: occurrence.term.tags,
        exampleSentence: occurrence.term.exampleSentence,
        observedSurfaces: enrichedOccurrences
          .filter(
            (candidate) =>
              morphologyKey(candidate.morphology) ===
              morphologyKey(occurrence.morphology),
          )
          .map((candidate) => candidate.surface),
      })),
      morphologyKey,
    );
    const existingVocabulary = await loadVocabularyByForms(
      vocabularyRequests.map((item) => item.dictionaryForm),
    );
    const missingVocabulary = vocabularyRequests.filter(
      (request) => !matchingVocabularyRow(existingVocabulary, request),
    );
    const missingCharacters = new Set(
      characters.filter((character) => !existingKanji.has(character)),
    );
    const kanjiSeed = uniqueBy(
      enrichedOccurrences.flatMap((occurrence) => occurrence.term.kanjiDetails),
      (item) => item.character,
    )
      .filter((item) => missingCharacters.has(item.character))
      .map((item) => ({
        character: item.character,
        meanings: item.meanings,
        readings: item.readings,
        onyomi: item.onyomi,
        kunyomi: item.kunyomi,
        exampleWords: item.exampleWords,
        strokeCount: item.strokeCount,
      }));
    const vocabularySeed = missingVocabulary.map((request) => ({
      writtenForm: request.dictionaryForm,
      reading: request.dictionaryReading,
      meaning: request.meaning,
      partOfSpeech: request.partOfSpeech,
      tags: request.tags,
      exampleSentence: request.exampleSentence,
      linkedKanjiCharacters: linkedKanjiCharacters(
        request.dictionaryForm,
        characters,
      ),
      conjugationType: request.conjugationType ?? "",
      aliases: request.dictionaryAlias ? [request.dictionaryAlias] : [],
      formOverrides: {},
      lexiconSchemaVersion: 4,
      observedSurfaces: [...new Set(request.observedSurfaces)],
    }));

    if (kanjiSeed.length > 0 || vocabularySeed.length > 0) {
      const stored = await (
        client as unknown as SupabaseClient
      ).rpc("enrich_custom_lesson_library_v3", {
        p_level: input.level,
        p_seed: {
          kanji: kanjiSeed,
          grammar: [],
          vocabulary: vocabularySeed,
        } as unknown as Json,
        p_source_model: generated.model,
      });
      if (stored.error) {
        throw new Error(
          `Missing word records could not be saved: ${stored.error.message}`,
        );
      }
    }

    records = await loadKanjiAndGrammar(characters, patterns);
    vocabularyRows = uniqueBy(
      [
        ...candidateRows,
        ...(await loadVocabularyByForms(
          enrichedOccurrences.map(
            (occurrence) => occurrence.morphology.dictionaryForm,
          ),
        )),
      ],
      (row) => row.id,
    );
  }

  const kanji = input.plan.kanji.map((target) => {
    const row = records.kanji.find((item) => item.character === target.character);
    if (!row) throw new Error(`Kanji library record missing for ${target.character}.`);
    return canonicalKanji(row);
  });
  const grammar = input.plan.grammar.map((target) => {
    const row =
      records.grammar.find(
        (item) =>
          item.pattern === target.pattern && item.jlpt_level === target.level,
      ) ?? records.grammar.find((item) => item.pattern === target.pattern);
    if (!row) throw new Error(`Grammar library record missing for ${target.pattern}.`);
    return canonicalGrammar(row);
  });

  const vocabulary: CanonicalVocabulary[] = [];
  const termsByLine = new Map<number, StoryDraft["lines"][number]["terms"]>();
  for (const occurrence of preflight.known) {
    const morphology = morphologyFromMatch(occurrence.match);
    const resolved = resolveFinalOccurrence(
      occurrence.match.row,
      occurrence.surface,
      morphology,
    );
    const terms = termsByLine.get(occurrence.lineIndex) ?? [];
    terms.push({
      surface: occurrence.surface,
      readingHint: resolved.reading,
      scriptType: storyWordScript(occurrence.surface),
      dictionaryForm: morphology.dictionaryForm,
      dictionaryReading: morphology.dictionaryReading,
      partOfSpeech: morphology.partOfSpeech,
      conjugationType: morphology.conjugationType ?? "",
      dictionaryAlias: morphology.dictionaryAlias,
    } as StoryDraft["lines"][number]["terms"][number]);
    termsByLine.set(occurrence.lineIndex, terms);
    vocabulary.push(
      canonicalVocabulary(
        occurrence.match.row,
        occurrence.surface,
        resolved.reading,
      ),
    );
  }

  for (const occurrence of enrichedOccurrences) {
    const row = matchingVocabularyRow(vocabularyRows, occurrence.morphology);
    if (!row) {
      throw new Error(
        `Vocabulary library record missing for ${occurrence.morphology.dictionaryForm}.`,
      );
    }
    const resolved = resolveFinalOccurrence(
      row,
      occurrence.surface,
      occurrence.morphology,
    );
    const terms = termsByLine.get(occurrence.lineIndex) ?? [];
    terms.push({
      surface: occurrence.surface,
      readingHint: resolved.reading,
      scriptType: storyWordScript(occurrence.surface),
      dictionaryForm: occurrence.morphology.dictionaryForm,
      dictionaryReading: occurrence.morphology.dictionaryReading,
      partOfSpeech: occurrence.morphology.partOfSpeech,
      conjugationType: occurrence.morphology.conjugationType ?? "",
      dictionaryAlias: occurrence.morphology.dictionaryAlias,
    } as StoryDraft["lines"][number]["terms"][number]);
    termsByLine.set(occurrence.lineIndex, terms);
    vocabulary.push(
      canonicalVocabulary(row, occurrence.surface, resolved.reading),
    );
  }

  const normalizedDraft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line, lineIndex) => ({
      ...line,
      terms: (termsByLine.get(lineIndex) ?? []).sort((left, right) => {
        const leftIndex = line.japanese.indexOf(left.surface);
        const rightIndex = line.japanese.indexOf(right.surface);
        return leftIndex - rightIndex || right.surface.length - left.surface.length;
      }),
    })),
  };

  return {
    draft: normalizedDraft,
    library: {
      kanji,
      grammar,
      vocabulary: uniqueBy(
        vocabulary,
        (item) => `${item.libraryId}\u0000${item.term}\u0000${item.reading}`,
      ),
    },
    audits: [
      {
        stage: "library",
        model: generated?.model ?? "local-lexicon-db",
        repaired: generated?.repaired ?? false,
      },
    ],
  };
}
