import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FORM_CODES,
  SUPPORTED_VERB_TRANSFORMATION_CHAINS,
  VERB_TYPES,
  canonicalSurface,
  composeEntryForm,
  containsKanji,
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
};

interface SegmentPart {
  segment: string;
  index: number;
  isWordLike?: boolean;
}

interface FormMatch {
  row: VocabularyRow;
  entry: LexiconEntry;
  form: GeneratedForm;
  matchedSpelling: string;
  matchedThroughAlias: boolean;
}

const PARTICLES = new Set([
  "は", "が", "を", "に", "へ", "で", "と", "の", "も", "や", "か",
  "から", "まで", "より", "しか", "だけ", "ほど", "など", "ね", "よ",
]);
const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const STORY_PARTS = new Set<PartOfSpeech>([
  "noun", "verb", "i-adjective", "na-adjective", "adverb", "expression", "other",
]);

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function chunks<T>(items: T[], size = 80): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

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

function storySurfaces(draft: StoryOnlyDraft): string[] {
  const values = new Set<string>();
  const japaneseSegmenter = segmenter();
  for (const line of draft.lines) {
    const pieces = [...japaneseSegmenter.segment(line.japanese)]
      .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
      .map((part) => part.segment);
    for (let start = 0; start < pieces.length; start += 1) {
      let combined = "";
      for (let end = start; end < Math.min(pieces.length, start + 6); end += 1) {
        combined += pieces[end]!;
        const normalized = normalizeJapanese(combined);
        if (normalized && normalized.length <= 32) values.add(normalized);
      }
    }
  }
  return [...values];
}

function isPartOfSpeech(value: string): value is PartOfSpeech {
  return STORY_PARTS.has(value as PartOfSpeech);
}

function isVerbType(value: string | null): value is VerbType {
  return typeof value === "string" && (VERB_TYPES as readonly string[]).includes(value);
}

function formOverrides(value: Json): FormOverrides | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as unknown as FormOverrides)
    : undefined;
}

function lexiconEntry(row: VocabularyRow): LexiconEntry {
  const dictionaryForm = normalizeJapanese(row.dictionary_form || row.written_form);
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
    source: "manual",
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
    return SUPPORTED_VERB_TRANSFORMATION_CHAINS.map((chain) => [...chain]);
  }
  return [
    [],
    ...FORM_CODES.filter((code) => code !== "dictionary").map((code) => [code] as FormCode[]),
  ];
}

function buildFormIndex(rows: VocabularyRow[]): Map<string, FormMatch[]> {
  const index = new Map<string, FormMatch[]>();
  const add = (surface: string, match: FormMatch) => {
    const normalized = normalizeJapanese(surface);
    if (!normalized || PARTICLES.has(normalized)) return;
    const current = index.get(normalized) ?? [];
    if (!current.some((item) => item.row.id === match.row.id)) {
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
        try {
          const form = composeEntryForm(entry, chain);
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
        } catch {
          // Unsupported manual override or transformation: skip this form only.
        }
      }
    }
  }
  return index;
}

function uniqueMatch(index: Map<string, FormMatch[]>, surface: string): FormMatch | null {
  const matches = index.get(normalizeJapanese(surface)) ?? [];
  const ids = [...new Set(matches.map((item) => item.row.id))];
  return ids.length === 1 ? matches.find((item) => item.row.id === ids[0]) ?? null : null;
}

async function loadRecords(
  draft: StoryOnlyDraft,
  plan: LessonPlanV3,
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[]; vocabulary: VocabularyRow[] }> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const characters = [...new Set(draft.lines.flatMap((line) => line.japanese.match(/\p{Script=Han}/gu) ?? []))];
  const patterns = plan.grammar.map((item) => item.pattern);
  const surfaces = storySurfaces(draft);

  const vocabularyQueries = chunks(surfaces).flatMap((group) => [
    admin.from("vocabulary_records").select("*").in("dictionary_form", group).is("archived_at", null).neq("quality_status", "rejected"),
    admin.from("vocabulary_records").select("*").in("written_form", group).is("archived_at", null).neq("quality_status", "rejected"),
    admin.from("vocabulary_records").select("*").overlaps("aliases", group).is("archived_at", null).neq("quality_status", "rejected"),
  ]);

  const [kanjiResult, grammarResult, ...vocabularyResults] = await Promise.all([
    characters.length > 0
      ? admin.from("kanji_records").select("*").in("character", characters).is("archived_at", null).neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as KanjiRow[], error: null }),
    patterns.length > 0
      ? admin.from("grammar_records").select("*").in("pattern", patterns).is("archived_at", null).neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as GrammarRow[], error: null }),
    ...vocabularyQueries,
  ]);

  const error = [kanjiResult, grammarResult, ...vocabularyResults].find((result) => result.error)?.error;
  if (error) throw new Error(`Existing language library could not be loaded: ${error.message}`);

  return {
    kanji: (kanjiResult.data ?? []) as KanjiRow[],
    grammar: (grammarResult.data ?? []) as GrammarRow[],
    vocabulary: uniqueBy(
      vocabularyResults.flatMap((result) => (result.data ?? []) as VocabularyRow[]),
      (row) => row.id,
    ),
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

function canonicalVocabulary(match: FormMatch, surface: string): CanonicalVocabulary {
  return {
    libraryId: match.row.id,
    term: surface,
    reading: match.form.kana,
    meaning: match.row.meaning,
    partOfSpeech: match.row.part_of_speech,
    level: match.row.jlpt_level,
    tags: match.row.tags,
    exampleSentence: match.row.example_sentence,
    linkedKanjiIds: match.row.linked_kanji_ids,
  };
}

function resolveLine(
  japanese: string,
  index: Map<string, FormMatch[]>,
): { terms: StoryDraft["lines"][number]["terms"]; vocabulary: CanonicalVocabulary[] } {
  const pieces = [...segmenter().segment(japanese)]
    .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
    .map((part) => ({ text: part.segment, start: part.index, end: part.index + part.segment.length }));
  const terms: StoryDraft["lines"][number]["terms"] = [];
  const vocabulary: CanonicalVocabulary[] = [];

  let cursor = 0;
  while (cursor < pieces.length) {
    let found: { end: number; surface: string; match: FormMatch } | null = null;
    for (let end = Math.min(pieces.length, cursor + 6); end > cursor; end -= 1) {
      const surface = pieces.slice(cursor, end).map((piece) => piece.text).join("");
      const match = uniqueMatch(index, surface);
      if (match) {
        found = { end, surface, match };
        break;
      }
    }
    if (!found) {
      cursor += 1;
      continue;
    }
    const dictionaryForm = canonicalSurface(found.match.entry.kanji, found.match.entry.kana);
    terms.push({
      surface: found.surface,
      readingHint: found.match.form.kana,
      scriptType: storyWordScript(found.surface),
      dictionaryForm,
      dictionaryReading: found.match.entry.kana,
      partOfSpeech: found.match.entry.partOfSpeech,
      conjugationType: found.match.entry.conjugationType ?? "",
      dictionaryAlias: found.match.matchedThroughAlias ? found.match.matchedSpelling : "",
    } as StoryDraft["lines"][number]["terms"][number]);
    vocabulary.push(canonicalVocabulary(found.match, found.surface));
    cursor = found.end;
  }
  return { terms, vocabulary };
}

/**
 * Local-only story resolution. It never calls a model and never creates or
 * updates kanji, grammar, or vocabulary records. Story words become tappable
 * only when an exact canonical/alias/conjugated form already exists in DB.
 */
export async function resolveStoryFromExistingLibrary(
  _client: SupabaseClient<Database>,
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
  const records = await loadRecords(input.draft, input.plan);
  const formIndex = buildFormIndex(records.vocabulary);
  const allVocabulary: CanonicalVocabulary[] = [];

  const draft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line) => {
      const resolved = resolveLine(line.japanese, formIndex);
      allVocabulary.push(...resolved.vocabulary);
      return { ...line, terms: resolved.terms };
    }),
  };

  const kanji = input.plan.kanji.flatMap((target) => {
    const row = records.kanji.find((item) => item.character === target.character);
    return row ? [canonicalKanji(row)] : [];
  });
  const grammar = input.plan.grammar.flatMap((target) => {
    const row = records.grammar.find((item) => item.pattern === target.pattern);
    return row ? [canonicalGrammar(row)] : [];
  });

  return {
    draft,
    library: {
      kanji,
      grammar,
      vocabulary: uniqueBy(
        allVocabulary,
        (item) => `${item.libraryId}\u0000${item.term}\u0000${item.reading}`,
      ),
    },
    audits: [{ stage: "library", model: "existing-library-only", repaired: false }],
  };
}
