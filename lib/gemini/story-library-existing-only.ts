import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
import { filterStoryPracticeKanji } from "@/lib/gemini/vocabulary-question-contract";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

const CURATED_SOURCE_MODEL = "jlpt-curated-csv";

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

const JAPANESE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const PARTICLES = new Set([
  "は", "が", "を", "に", "へ", "で", "と", "の", "も", "や", "か",
  "から", "まで", "より", "しか", "だけ", "ほど", "など", "ね", "よ",
]);

function normalizeJapanese(value: string): string {
  return value.normalize("NFKC").trim();
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

async function loadRecords(
  draft: StoryOnlyDraft,
  plan: LessonPlanV3,
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[]; vocabulary: VocabularyRow[] }> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const characters = [...new Set([
    ...plan.kanji.map((item) => item.character),
    ...draft.lines.flatMap((line) => line.japanese.match(/\p{Script=Han}/gu) ?? []),
  ])];
  const patterns = [...new Set([
    ...plan.grammar.map((item) => item.pattern),
    ...plan.reinforcementGrammar.map((item) => item.pattern),
  ])];
  const surfaces = storySurfaces(draft);

  const vocabularyQueries = chunks(surfaces).flatMap((group) => [
    admin.from("vocabulary_records").select("*")
      .in("dictionary_form", group)
      .eq("source_model", CURATED_SOURCE_MODEL)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    admin.from("vocabulary_records").select("*")
      .in("written_form", group)
      .eq("source_model", CURATED_SOURCE_MODEL)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    admin.from("vocabulary_records").select("*")
      .overlaps("aliases", group)
      .eq("source_model", CURATED_SOURCE_MODEL)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
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

function vocabularyIndex(rows: VocabularyRow[]): Map<string, VocabularyRow[]> {
  const index = new Map<string, VocabularyRow[]>();
  const add = (value: string, row: VocabularyRow) => {
    const normalized = normalizeJapanese(value);
    if (!normalized || PARTICLES.has(normalized)) return;
    const current = index.get(normalized) ?? [];
    if (!current.some((item) => item.id === row.id)) current.push(row);
    index.set(normalized, current);
  };

  for (const row of rows) {
    add(row.dictionary_form || row.written_form, row);
    add(row.written_form, row);
    for (const alias of row.aliases ?? []) add(alias, row);
  }
  return index;
}

function uniqueVocabularyMatch(
  index: Map<string, VocabularyRow[]>,
  surface: string,
): VocabularyRow | null {
  const rows = index.get(normalizeJapanese(surface)) ?? [];
  const ids = [...new Set(rows.map((row) => row.id))];
  return ids.length === 1 ? rows.find((row) => row.id === ids[0]) ?? null : null;
}

function canonicalVocabulary(row: VocabularyRow, surface: string): CanonicalVocabulary {
  return {
    libraryId: row.id,
    term: surface,
    reading: row.reading,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech,
    level: row.jlpt_level,
    tags: row.tags,
    exampleSentence: row.example_sentence,
    linkedKanjiIds: row.linked_kanji_ids,
  };
}

function resolveLine(
  japanese: string,
  index: Map<string, VocabularyRow[]>,
): { terms: StoryDraft["lines"][number]["terms"]; vocabulary: CanonicalVocabulary[] } {
  const pieces = [...segmenter().segment(japanese)]
    .filter((part) => part.isWordLike && JAPANESE.test(part.segment))
    .map((part) => ({ text: part.segment, start: part.index, end: part.index + part.segment.length }));
  const terms: StoryDraft["lines"][number]["terms"] = [];
  const vocabulary: CanonicalVocabulary[] = [];

  let cursor = 0;
  while (cursor < pieces.length) {
    let found: { end: number; surface: string; row: VocabularyRow } | null = null;
    for (let end = Math.min(pieces.length, cursor + 6); end > cursor; end -= 1) {
      const surface = pieces.slice(cursor, end).map((piece) => piece.text).join("");
      const row = uniqueVocabularyMatch(index, surface);
      if (row) {
        found = { end, surface, row };
        break;
      }
    }
    if (!found) {
      cursor += 1;
      continue;
    }

    terms.push({
      surface: found.surface,
      readingHint: found.row.reading,
      scriptType: storyWordScript(found.surface),
      dictionaryForm: found.row.dictionary_form || found.row.written_form,
      dictionaryReading: found.row.reading,
      partOfSpeech: found.row.part_of_speech,
      conjugationType: found.row.conjugation_type ?? "",
      dictionaryAlias: "",
    } as StoryDraft["lines"][number]["terms"][number]);
    vocabulary.push(canonicalVocabulary(found.row, found.surface));
    cursor = found.end;
  }
  return { terms, vocabulary };
}

/**
 * Resolves only the curated vocabulary rows inserted from Vocabs/*.csv. Kanji
 * and grammar remain target identities; no dictionary or AI enrichment occurs.
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
  const formIndex = vocabularyIndex(records.vocabulary);
  const allVocabulary: CanonicalVocabulary[] = [];

  const draft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line) => {
      const resolved = resolveLine(line.japanese, formIndex);
      allVocabulary.push(...resolved.vocabulary);
      return { ...line, terms: resolved.terms };
    }),
  };

  const storyPracticeKanji = filterStoryPracticeKanji({
    japaneseStory: input.draft.lines.map((line) => line.japanese).join(""),
    knownKanji: input.plan.knownKanji,
    targetKanji: input.plan.kanji.map((item) => item.character),
  });
  const kanjiCharacters = [...new Set([
    ...input.plan.kanji.map((item) => item.character),
    ...storyPracticeKanji,
  ])];
  const kanji = kanjiCharacters.flatMap((character) => {
    const row = records.kanji.find((item) => item.character === character);
    return row ? [canonicalKanji(row)] : [];
  });
  const grammarPatterns = [
    ...input.plan.grammar,
    ...input.plan.reinforcementGrammar,
  ];
  const grammar = grammarPatterns.flatMap((target) => {
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
      generationContext: {
        interests: input.plan.interests,
        targetGrammar: input.plan.grammar.map((item) => item.pattern),
        targetKanji: input.plan.kanji.map((item) => item.character),
      },
    },
    audits: [{ stage: "library", model: CURATED_SOURCE_MODEL, repaired: false }],
  };
}
