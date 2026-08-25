import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { matchCuratedStoryVocabularyOccurrences } from "@/lib/curated-vocabulary-catalog";
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

type EnrichmentRow =
  Database["public"]["Tables"]["story_vocabulary_enrichments"]["Row"];

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function loadRecords(
  requestId: string,
  draft: StoryOnlyDraft,
  plan: LessonPlanV3,
): Promise<{
  kanji: KanjiRow[];
  grammar: GrammarRow[];
  vocabulary: VocabularyRow[];
  enrichments: EnrichmentRow[];
}> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const characters = [...new Set([
    ...plan.kanji.map((item) => item.character),
    ...draft.lines.flatMap((line) => line.japanese.match(/\p{Script=Han}/gu) ?? []),
  ])];
  const patterns = plan.grammar.map((item) => item.pattern);
  const [kanjiResult, grammarResult, enrichmentResult] = await Promise.all([
    characters.length > 0
      ? admin.from("kanji_records").select("*").in("character", characters).is("archived_at", null).neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as KanjiRow[], error: null }),
    patterns.length > 0
      ? admin.from("grammar_records").select("*").in("pattern", patterns).is("archived_at", null).neq("quality_status", "rejected")
      : Promise.resolve({ data: [] as GrammarRow[], error: null }),
    admin.from("story_vocabulary_enrichments").select("*")
      .eq("request_id", requestId)
      .order("position"),
  ]);

  const error = [kanjiResult, grammarResult, enrichmentResult].find((result) => result.error)?.error;
  if (error) throw new Error(`Existing language library could not be loaded: ${error.message}`);

  const enrichments = (enrichmentResult.data ?? []) as EnrichmentRow[];
  const vocabularyIds = [...new Set(enrichments.map((item) => item.vocabulary_id))];
  const vocabularyResult = vocabularyIds.length > 0
    ? await admin.from("vocabulary_records").select("*")
        .in("id", vocabularyIds)
        .is("archived_at", null)
        .neq("quality_status", "rejected")
    : { data: [] as VocabularyRow[], error: null };
  if (vocabularyResult.error) {
    throw new Error(`Existing language library could not be loaded: ${vocabularyResult.error.message}`);
  }

  return {
    kanji: (kanjiResult.data ?? []) as KanjiRow[],
    grammar: (grammarResult.data ?? []) as GrammarRow[],
    vocabulary: (vocabularyResult.data ?? []) as VocabularyRow[],
    enrichments,
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
  enrichment: EnrichmentRow,
): CanonicalVocabulary {
  return {
    libraryId: row.id,
    term: enrichment.word,
    reading: enrichment.reading,
    meaning: enrichment.meaning,
    partOfSpeech: row.part_of_speech,
    level: row.jlpt_level,
    tags: row.tags,
    exampleSentence: row.example_sentence,
    linkedKanjiIds: row.linked_kanji_ids,
  };
}

function resolveLine(
  japanese: string,
  records: { vocabulary: VocabularyRow[]; enrichments: EnrichmentRow[] },
): { terms: StoryDraft["lines"][number]["terms"]; vocabulary: CanonicalVocabulary[] } {
  const terms: StoryDraft["lines"][number]["terms"] = [];
  const vocabulary: CanonicalVocabulary[] = [];
  const rowsById = new Map(records.vocabulary.map((row) => [row.id, row]));
  const linksBySurfaceAndReading = new Map(
    records.enrichments.map((item) => [
      `${item.word.normalize("NFKC")}\u0000${item.reading.normalize("NFKC")}`,
      item,
    ]),
  );

  for (const match of matchCuratedStoryVocabularyOccurrences(japanese)) {
    const enrichment = linksBySurfaceAndReading.get(
      `${match.word.normalize("NFKC")}\u0000${match.reading.normalize("NFKC")}`,
    );
    const row = enrichment ? rowsById.get(enrichment.vocabulary_id) : null;
    if (!enrichment || !row) continue;
    terms.push({
      surface: enrichment.word,
      readingHint: enrichment.reading,
      scriptType: storyWordScript(enrichment.word),
      dictionaryForm: row.dictionary_form || row.written_form,
      dictionaryReading: row.reading,
      partOfSpeech: row.part_of_speech,
      conjugationType: row.conjugation_type ?? "",
      dictionaryAlias: "",
    } as StoryDraft["lines"][number]["terms"][number]);
    vocabulary.push(canonicalVocabulary(row, enrichment));
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
    requestId: string;
    level: JLPTLevel;
    plan: LessonPlanV3;
    draft: StoryOnlyDraft;
  },
): Promise<{
  draft: StoryDraft;
  library: ResolvedLessonLibrary;
  audits: GenerationAuditEntry[];
}> {
  const records = await loadRecords(input.requestId, input.draft, input.plan);
  const allVocabulary: CanonicalVocabulary[] = [];

  const draft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line) => {
      const resolved = resolveLine(line.japanese, records);
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
      generationContext: {
        targetGrammar: input.plan.grammar.map((item) => item.pattern),
        targetKanji: input.plan.kanji.map((item) => item.character),
      },
    },
    audits: [{ stage: "library", model: CURATED_SOURCE_MODEL, repaired: false }],
  };
}
