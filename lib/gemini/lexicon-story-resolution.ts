import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateLibraryEnrichment,
  type CanonicalGrammar,
  type CanonicalKanji,
  type CanonicalVocabulary,
  type GenerationAuditEntry,
  type LessonPlan,
  type MissingVocabulary,
  type ResolvedLessonLibrary,
  type StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";
import {
  PARTS_OF_SPEECH,
  VERB_TYPES,
  canonicalSurface,
  containsKanji,
  lookupSurface,
  normalizeJapanese,
  type FormOverrides,
  type LexiconEntry,
  type PartOfSpeech,
  type VerbType,
} from "@/lib/japanese-lexicon";
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
import type { LexicalDraftTerm } from "@/lib/gemini/story-lexicon-validation";

interface Morphology {
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: PartOfSpeech;
  conjugationType?: VerbType;
  dictionaryAlias: string;
}

interface VocabularyRequest extends Morphology {
  contextJapanese: string;
  contextEnglish: string;
  observedSurfaces: string[];
}

type KanjiRow = Database["public"]["Tables"]["kanji_records"]["Row"];
type GrammarRow = Database["public"]["Tables"]["grammar_records"]["Row"];
type VocabularyRow = Database["public"]["Tables"]["vocabulary_records"]["Row"] & {
  dictionary_form: string;
  conjugation_type: string | null;
  aliases: string[];
  form_overrides: Json;
  lexicon_schema_version: number;
};

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return (
    typeof value === "string" &&
    (PARTS_OF_SPEECH as readonly string[]).includes(value)
  );
}

function isVerbType(value: unknown): value is VerbType {
  return (
    typeof value === "string" &&
    (VERB_TYPES as readonly string[]).includes(value)
  );
}

function morphologyForTerm(
  term: StoryDraft["lines"][number]["terms"][number],
): Morphology {
  const lexical = term as Partial<LexicalDraftTerm>;
  const dictionaryForm = normalizeJapanese(lexical.dictionaryForm);
  const dictionaryReading = normalizeJapanese(lexical.dictionaryReading);
  const dictionaryAlias = normalizeJapanese(lexical.dictionaryAlias);
  if (!dictionaryForm || !dictionaryReading || !isPartOfSpeech(lexical.partOfSpeech)) {
    throw new Error(`Story word ${term.surface} is missing canonical morphology.`);
  }
  if (lexical.partOfSpeech === "particle" || lexical.partOfSpeech === "auxiliary") {
    throw new Error(`Story word ${term.surface} cannot be a standalone function word.`);
  }
  const conjugationType = isVerbType(lexical.conjugationType)
    ? lexical.conjugationType
    : undefined;
  if (lexical.partOfSpeech === "verb" && !conjugationType) {
    throw new Error(`Story verb ${term.surface} is missing its conjugation class.`);
  }
  if (lexical.partOfSpeech !== "verb" && normalizeJapanese(lexical.conjugationType)) {
    throw new Error(`Non-verb ${term.surface} cannot have a verb conjugation class.`);
  }
  return {
    dictionaryForm,
    dictionaryReading,
    partOfSpeech: lexical.partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    dictionaryAlias,
  };
}

function morphologyKey(value: Morphology): string {
  return [value.dictionaryForm, value.dictionaryReading, value.partOfSpeech].join("\u0000");
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
  term: string,
  reading: string,
): CanonicalVocabulary {
  return {
    libraryId: row.id,
    term,
    reading,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech,
    level: row.jlpt_level,
    tags: row.tags,
    exampleSentence: row.example_sentence,
    linkedKanjiIds: row.linked_kanji_ids,
  };
}

function sourceFor(row: VocabularyRow): LexiconEntry["source"] {
  if (row.source_type === "ai_enriched") return "gemini";
  if (row.source_type === "curated") return "manual";
  if (row.source_type === "imported") return "migration";
  return "seed";
}

function formOverrides(value: Json): FormOverrides | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as unknown as FormOverrides;
}

function lexiconEntry(row: VocabularyRow): LexiconEntry {
  const dictionaryForm = normalizeJapanese(row.dictionary_form || row.written_form);
  const partOfSpeech = isPartOfSpeech(row.part_of_speech) ? row.part_of_speech : "other";
  const conjugationType = isVerbType(row.conjugation_type) ? row.conjugation_type : undefined;
  const overrides = formOverrides(row.form_overrides);
  return {
    id: row.id,
    kanji: containsKanji(dictionaryForm) ? dictionaryForm : "",
    kana: normalizeJapanese(row.reading),
    meaning: row.meaning,
    partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    aliases: row.aliases.map(normalizeJapanese).filter(Boolean),
    ...(overrides ? { formOverrides: overrides } : {}),
    source: sourceFor(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function loadRecords(
  client: SupabaseClient<Database>,
  characters: string[],
  patterns: string[],
  dictionaryForms: string[],
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[]; vocabulary: VocabularyRow[] }> {
  const rawClient = client as unknown as SupabaseClient;
  const [kanji, grammar, vocabulary] = await Promise.all([
    client.from("kanji_records").select("*").in("character", characters).is("archived_at", null).neq("quality_status", "rejected"),
    client.from("grammar_records").select("*").in("pattern", patterns).is("archived_at", null).neq("quality_status", "rejected"),
    rawClient.from("vocabulary_records").select("*").in("dictionary_form", dictionaryForms).is("archived_at", null).neq("quality_status", "rejected"),
  ]);
  const firstError = [kanji, grammar, vocabulary].find((result) => result.error)?.error;
  if (firstError) throw new Error(`Language library could not be loaded: ${firstError.message}`);
  return {
    kanji: kanji.data ?? [],
    grammar: grammar.data ?? [],
    vocabulary: (vocabulary.data ?? []) as VocabularyRow[],
  };
}

function matchingVocabularyRow(rows: VocabularyRow[], request: Morphology): VocabularyRow | null {
  return rows.find((row) =>
    normalizeJapanese(row.dictionary_form || row.written_form) === request.dictionaryForm &&
    normalizeJapanese(row.reading) === request.dictionaryReading &&
    row.part_of_speech === request.partOfSpeech,
  ) ?? null;
}

function linkedKanjiCharacters(dictionaryForm: string, allowedCharacters: string[]): string[] {
  const allowed = new Set(allowedCharacters);
  return [...new Set((dictionaryForm.match(/\p{Script=Han}/gu) ?? []).filter((character) => allowed.has(character)))];
}

export async function resolveLessonLibraryWithLexicon(
  client: SupabaseClient<Database>,
  input: { topic: string; level: JLPTLevel; plan: LessonPlan; draft: StoryDraft },
): Promise<{ draft: StoryDraft; library: ResolvedLessonLibrary; audits: GenerationAuditEntry[] }> {
  const characters = uniqueBy([
    ...input.plan.kanji.map((item) => item.character),
    ...input.draft.lines.flatMap((line) => line.japanese.match(/\p{Script=Han}/gu) ?? []),
  ], (item) => item);
  const patterns = input.plan.grammar.map((item) => item.pattern);

  const occurrences = input.draft.lines.flatMap((line) => line.terms.map((term) => ({
    term,
    morphology: morphologyForTerm(term),
    contextJapanese: line.japanese,
    contextEnglish: line.english,
  })));
  const requests = uniqueBy(occurrences.map((item) => ({
    ...item.morphology,
    contextJapanese: item.contextJapanese,
    contextEnglish: item.contextEnglish,
    observedSurfaces: occurrences
      .filter((candidate) => morphologyKey(candidate.morphology) === morphologyKey(item.morphology))
      .map((candidate) => normalizeJapanese(candidate.term.surface)),
  })), morphologyKey);
  const dictionaryForms = requests.map((item) => item.dictionaryForm);

  let records = await loadRecords(client, characters, patterns, dictionaryForms);
  const unknownKanji = characters.filter((character) => !records.kanji.some((row) => row.character === character));
  const unknownGrammar = input.plan.grammar
    .filter((target) => !records.grammar.some((row) => row.pattern === target.pattern && row.jlpt_level === target.level))
    .map((item) => item.pattern);
  const missingVocabulary = requests.filter((request) => !matchingVocabularyRow(records.vocabulary, request));

  let audit: GenerationAuditEntry | null = null;
  let generatedVocabulary = new Map<string, MissingVocabulary & {
    meaning: string;
    partOfSpeech: string;
    tags: string[];
    exampleSentence: string;
  }>();
  let enrichmentSeed: Awaited<ReturnType<typeof generateLibraryEnrichment>>["seed"] = {
    kanji: [],
    grammar: [],
    vocabulary: [],
  };

  if (unknownKanji.length > 0 || unknownGrammar.length > 0 || missingVocabulary.length > 0) {
    const enrichment = await generateLibraryEnrichment({
      level: input.level,
      topic: input.topic,
      kanji: unknownKanji,
      allowedKanji: characters,
      grammar: unknownGrammar,
      vocabulary: missingVocabulary.map((item) => ({
        writtenForm: item.dictionaryForm,
        readingHint: item.dictionaryReading,
        contextJapanese: item.contextJapanese,
        contextEnglish: item.contextEnglish,
      })),
    });
    enrichmentSeed = enrichment.seed;
    audit = enrichment.audit;
    generatedVocabulary = new Map(missingVocabulary.map((item, index) => {
      const generated = enrichment.seed.vocabulary[index]!;
      return [morphologyKey(item), {
        writtenForm: item.dictionaryForm,
        readingHint: item.dictionaryReading,
        contextJapanese: item.contextJapanese,
        contextEnglish: item.contextEnglish,
        meaning: generated.meaning,
        partOfSpeech: generated.partOfSpeech,
        tags: generated.tags,
        exampleSentence: generated.exampleSentence,
      }];
    }));
  }

  const vocabularySeed = requests.map((request) => {
    const existing = matchingVocabularyRow(records.vocabulary, request);
    const generated = generatedVocabulary.get(morphologyKey(request));
    if (!existing && !generated) throw new Error(`Vocabulary metadata missing for ${request.dictionaryForm}.`);
    return {
      writtenForm: request.dictionaryForm,
      reading: request.dictionaryReading,
      meaning: existing?.meaning ?? generated!.meaning,
      partOfSpeech: request.partOfSpeech,
      tags: existing?.tags ?? generated!.tags,
      exampleSentence: existing?.example_sentence || generated?.exampleSentence || request.contextJapanese,
      linkedKanjiCharacters: linkedKanjiCharacters(request.dictionaryForm, characters),
      conjugationType: request.conjugationType ?? "",
      aliases: request.dictionaryAlias ? [request.dictionaryAlias] : [],
      formOverrides: existing?.form_overrides ?? {},
      lexiconSchemaVersion: 4,
      observedSurfaces: [...new Set(request.observedSurfaces)],
    };
  });

  const rawClient = client as unknown as SupabaseClient;
  const stored = await rawClient.rpc("enrich_custom_lesson_library_v3", {
    p_level: input.level,
    p_seed: {
      kanji: enrichmentSeed.kanji,
      grammar: enrichmentSeed.grammar,
      vocabulary: vocabularySeed,
    } as unknown as Json,
    p_source_model: audit?.model ?? "aiko-japanese-lexicon-6.0.1",
  });
  if (stored.error) throw new Error(`Missing language records could not be saved: ${stored.error.message}`);

  records = await loadRecords(client, characters, patterns, dictionaryForms);
  const kanji = input.plan.kanji.map((target) => {
    const row = records.kanji.find((item) => item.character === target.character);
    if (!row) throw new Error(`Kanji library record missing for ${target.character}.`);
    return canonicalKanji(row);
  });
  const grammar = input.plan.grammar.map((target) => {
    const row = records.grammar.find((item) => item.pattern === target.pattern && item.jlpt_level === target.level)
      ?? records.grammar.find((item) => item.pattern === target.pattern);
    if (!row) throw new Error(`Grammar library record missing for ${target.pattern}.`);
    return canonicalGrammar(row);
  });

  const vocabulary: CanonicalVocabulary[] = [];
  const normalizedDraft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line) => ({
      ...line,
      terms: line.terms.map((term) => {
        const morphology = morphologyForTerm(term);
        const row = matchingVocabularyRow(records.vocabulary, morphology);
        if (!row) throw new Error(`Vocabulary library record missing for ${morphology.dictionaryForm}.`);
        const entry = lexiconEntry(row);
        const expectedAlias = morphology.dictionaryAlias;
        const candidates = lookupSurface([entry], term.surface).filter((candidate) =>
          candidate.form.kana === normalizeJapanese(term.readingHint) &&
          (expectedAlias
            ? candidate.matchedThroughAlias && candidate.matchedSpelling === expectedAlias
            : !candidate.matchedThroughAlias),
        );
        if (candidates.length < 1) {
          throw new Error(`${term.surface} cannot be reproduced from ${canonicalSurface(entry.kanji, entry.kana)}.`);
        }
        const selected = candidates[0]!;
        vocabulary.push(canonicalVocabulary(row, normalizeJapanese(term.surface), selected.form.kana));
        return { ...term, readingHint: selected.form.kana };
      }),
    })),
  };

  return {
    draft: normalizedDraft,
    library: {
      kanji,
      grammar,
      vocabulary: uniqueBy(vocabulary, (item) => `${item.libraryId}\u0000${item.term}\u0000${item.reading}`),
    },
    audits: audit ? [audit] : [],
  };
}
