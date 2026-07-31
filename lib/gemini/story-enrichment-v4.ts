import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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

interface KnownOccurrence {
  lineIndex: number;
  start: number;
  end: number;
  surface: string;
  match: FormMatch;
}

interface Morphology {
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: PartOfSpeech;
  conjugationType?: VerbType;
  dictionaryAlias: string;
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
    ["noun", "verb", "i-adjective", "na-adjective", "adverb", "expression", "other"].includes(value)
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

function resolveKnownOccurrences(
  regions: LexicalRegion[],
  formIndex: Map<string, FormMatch[]>,
): KnownOccurrence[] {
  const known: KnownOccurrence[] = [];
  for (const region of regions) {
    let cursor = 0;
    while (cursor < region.pieces.length) {
      const found = knownAt(region, cursor, formIndex);
      if (!found) {
        cursor += 1;
        continue;
      }
      const first = region.pieces[cursor]!;
      const last = region.pieces[found.end - 1]!;
      known.push({
        lineIndex: region.lineIndex,
        start: first.start,
        end: last.end,
        surface: found.surface,
        match: found.match,
      });
      cursor = found.end;
    }
  }
  return known;
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
  const queries: Array<PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>> = [];
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
  if (error) throw new Error(`Vocabulary lookup failed: ${error.message}`);
  return uniqueBy(
    results.flatMap((result) => (result.data ?? []) as VocabularyRow[]),
    (row) => row.id,
  );
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
 * Resolves story taps exclusively from records that already exist in AIko's
 * permanent library. Unresolved story text remains plain text and never blocks
 * the lesson. This function performs no model call and writes no library data.
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
  void client;
  const characters = uniqueBy(
    input.draft.lines.flatMap(
      (line) => line.japanese.match(/\p{Script=Han}/gu) ?? [],
    ),
    (item) => item,
  );
  const patterns = input.plan.grammar.map((item) => item.pattern);
  const records = await loadKanjiAndGrammar(characters, patterns);
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
  const candidateRows = await loadVocabularyCandidates(
    querySurfaces(regions),
    records.kanji.map((row) => row.id),
  );
  const knownOccurrences = resolveKnownOccurrences(
    regions,
    buildFormIndex(candidateRows),
  );

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
  for (const occurrence of knownOccurrences) {
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

  const normalizedDraft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line, lineIndex) => ({
      ...line,
      terms: termsByLine.get(lineIndex) ?? [],
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
        model: "local-lexicon-db",
        repaired: false,
      },
    ],
  };
}
