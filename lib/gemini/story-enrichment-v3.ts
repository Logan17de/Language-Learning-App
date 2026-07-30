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
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";

interface RawEnrichedTerm extends LexicalDraftTerm {
  meaning: string;
  tags: string[];
  exampleSentence: string;
}

interface RawLineEnrichment {
  lineIndex: number;
  terms: RawEnrichedTerm[];
}

interface RawKanjiEnrichment {
  requestIndex: number;
  meanings: string[];
  readings: string[];
  onyomi: string[];
  kunyomi: string[];
  exampleWords: string[];
  strokeCount: number;
}

interface RawGrammarEnrichment {
  requestIndex: number;
  meaning: string;
  formation: string;
  usageNotes: string;
  nuance: string;
  exampleSentences: string[];
}

interface RawStoryEnrichment {
  lines: RawLineEnrichment[];
  kanji: RawKanjiEnrichment[];
  grammar: RawGrammarEnrichment[];
}

interface Morphology {
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: PartOfSpeech;
  conjugationType?: VerbType;
  dictionaryAlias: string;
}

interface VocabularyRequest extends Morphology {
  meaning: string;
  tags: string[];
  exampleSentence: string;
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

function stringArray(minItems = 0, maxItems = 100): JsonSchema {
  return {
    type: "array",
    minItems,
    maxItems,
    items: { type: "string" },
  };
}

function objectArray(
  minItems: number,
  maxItems: number,
  items: JsonSchema,
): JsonSchema {
  return { type: "array", minItems, maxItems, items };
}

function enrichmentSchema(input: {
  lineCount: number;
  unknownKanjiCount: number;
  unknownGrammarCount: number;
}): JsonSchema {
  const term: JsonSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "surface",
      "readingHint",
      "scriptType",
      "dictionaryForm",
      "dictionaryReading",
      "partOfSpeech",
      "conjugationType",
      "dictionaryAlias",
      "meaning",
      "tags",
      "exampleSentence",
    ],
    properties: {
      surface: { type: "string" },
      readingHint: { type: "string" },
      scriptType: {
        type: "string",
        enum: ["kanji", "hiragana", "katakana"],
      },
      dictionaryForm: { type: "string" },
      dictionaryReading: { type: "string" },
      partOfSpeech: { type: "string", enum: [...STORY_CONTENT_PARTS] },
      conjugationType: { type: "string", enum: ["", ...VERB_TYPES] },
      dictionaryAlias: { type: "string" },
      meaning: { type: "string" },
      tags: stringArray(0, 6),
      exampleSentence: { type: "string" },
    },
  };

  return {
    type: "object",
    additionalProperties: false,
    required: ["lines", "kanji", "grammar"],
    properties: {
      lines: objectArray(input.lineCount, input.lineCount, {
        type: "object",
        additionalProperties: false,
        required: ["lineIndex", "terms"],
        properties: {
          lineIndex: { type: "integer" },
          terms: objectArray(1, 14, term),
        },
      }),
      kanji: objectArray(
        input.unknownKanjiCount,
        input.unknownKanjiCount,
        {
          type: "object",
          additionalProperties: false,
          required: [
            "requestIndex",
            "meanings",
            "readings",
            "onyomi",
            "kunyomi",
            "exampleWords",
            "strokeCount",
          ],
          properties: {
            requestIndex: { type: "integer" },
            meanings: stringArray(1, 6),
            readings: stringArray(1, 12),
            onyomi: stringArray(0, 8),
            kunyomi: stringArray(0, 8),
            exampleWords: stringArray(1, 8),
            strokeCount: { type: "integer" },
          },
        },
      ),
      grammar: objectArray(
        input.unknownGrammarCount,
        input.unknownGrammarCount,
        {
          type: "object",
          additionalProperties: false,
          required: [
            "requestIndex",
            "meaning",
            "formation",
            "usageNotes",
            "nuance",
            "exampleSentences",
          ],
          properties: {
            requestIndex: { type: "integer" },
            meaning: { type: "string" },
            formation: { type: "string" },
            usageNotes: { type: "string" },
            nuance: { type: "string" },
            exampleSentences: stringArray(1, 5),
          },
        },
      ),
    },
  };
}

function exactIndexes(
  items: unknown,
  length: number,
  label: string,
): string[] {
  if (!Array.isArray(items) || items.length !== length) {
    return [`${label} must contain exactly ${length} results.`];
  }
  const indexes = items.flatMap((item) =>
    isRecord(item) && Number.isInteger(item.requestIndex)
      ? [Number(item.requestIndex)]
      : [],
  );
  const expected = Array.from({ length }, (_, index) => index);
  return indexes.length === length && expected.every((index) => indexes.includes(index))
    ? []
    : [`${label} requestIndex values must cover 0-${Math.max(0, length - 1)} exactly once.`];
}

function lineIndexes(items: unknown, length: number): string[] {
  if (!Array.isArray(items) || items.length !== length) {
    return [`lines must contain exactly ${length} results.`];
  }
  const indexes = items.flatMap((item) =>
    isRecord(item) && Number.isInteger(item.lineIndex)
      ? [Number(item.lineIndex)]
      : [],
  );
  const expected = Array.from({ length }, (_, index) => index);
  return indexes.length === length && expected.every((index) => indexes.includes(index))
    ? []
    : [`lineIndex values must cover 0-${Math.max(0, length - 1)} exactly once.`];
}

function enrichmentIssues(
  value: unknown,
  story: StoryOnlyDraft,
  unknownKanjiCount: number,
  unknownGrammarCount: number,
): string[] {
  if (!isRecord(value)) return ["Story enrichment must be an object."];
  const issues = [
    ...lineIndexes(value.lines, story.lines.length),
    ...exactIndexes(value.kanji, unknownKanjiCount, "kanji"),
    ...exactIndexes(value.grammar, unknownGrammarCount, "grammar"),
  ];
  if (!Array.isArray(value.lines)) return issues;

  const uniqueTerms = new Set<string>();
  for (const rawLine of value.lines) {
    if (!isRecord(rawLine) || !Number.isInteger(rawLine.lineIndex)) continue;
    const lineIndex = Number(rawLine.lineIndex);
    const source = story.lines[lineIndex];
    if (!source || !Array.isArray(rawLine.terms)) {
      issues.push(`Line enrichment ${lineIndex} is invalid.`);
      continue;
    }
    let cursor = 0;
    const coveredKanji = new Set<string>();
    rawLine.terms.forEach((candidate, termIndex) => {
      const label = `Line ${lineIndex + 1}, term ${termIndex + 1}`;
      if (!isRecord(candidate)) {
        issues.push(`${label} must be an object.`);
        return;
      }
      const term = candidate as unknown as RawEnrichedTerm;
      issues.push(...lexicalTermIssues(term, label));
      if (term.scriptType !== storyWordScript(term.surface)) {
        issues.push(`${label} has the wrong script type.`);
      }
      if (!text(term.meaning)) issues.push(`${label} needs a concise English meaning.`);
      if (!Array.isArray(term.tags) || !term.tags.every((tag) => typeof tag === "string")) {
        issues.push(`${label} tags must be strings.`);
      }
      if (!text(term.exampleSentence)) issues.push(`${label} needs a natural Japanese example.`);

      const position = source.japanese.indexOf(term.surface, cursor);
      if (position < 0) {
        issues.push(`${label} is missing or out of order in the fixed story line.`);
      } else {
        cursor = position + term.surface.length;
      }
      for (const character of term.surface.match(/\p{Script=Han}/gu) ?? []) {
        coveredKanji.add(character);
      }
      uniqueTerms.add(`${normalizeJapanese(term.dictionaryForm)}\u0000${normalizeJapanese(term.dictionaryReading)}\u0000${term.partOfSpeech}`);
    });

    for (const character of source.japanese.match(/\p{Script=Han}/gu) ?? []) {
      if (!coveredKanji.has(character)) {
        issues.push(`Kanji ${character} in line ${lineIndex + 1} is not covered by an enriched content word.`);
      }
    }
  }

  if (uniqueTerms.size < 8 || uniqueTerms.size > 50) {
    issues.push("Enrichment must identify a focused set of 8-50 canonical content words.");
  }
  return [...new Set(issues)];
}

function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return typeof value === "string" &&
    (PARTS_OF_SPEECH as readonly string[]).includes(value);
}

function isVerbType(value: unknown): value is VerbType {
  return typeof value === "string" &&
    (VERB_TYPES as readonly string[]).includes(value);
}

function morphologyForTerm(term: RawEnrichedTerm): Morphology {
  const dictionaryForm = normalizeJapanese(term.dictionaryForm);
  const dictionaryReading = normalizeJapanese(term.dictionaryReading);
  const dictionaryAlias = normalizeJapanese(term.dictionaryAlias);
  if (!dictionaryForm || !dictionaryReading || !isPartOfSpeech(term.partOfSpeech)) {
    throw new Error(`Story word ${term.surface} is missing canonical morphology.`);
  }
  const conjugationType = isVerbType(term.conjugationType)
    ? term.conjugationType
    : undefined;
  if (term.partOfSpeech === "verb" && !conjugationType) {
    throw new Error(`Story verb ${term.surface} is missing its conjugation class.`);
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
  return [value.dictionaryForm, value.dictionaryReading, value.partOfSpeech].join("\u0000");
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
    aliases: row.aliases.map(normalizeJapanese).filter(Boolean),
    ...(overrides ? { formOverrides: overrides } : {}),
    source: sourceFor(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function matchingVocabularyRow(
  rows: VocabularyRow[],
  request: Morphology,
): VocabularyRow | null {
  return rows.find((row) =>
    normalizeJapanese(row.dictionary_form || row.written_form) === request.dictionaryForm &&
    normalizeJapanese(row.reading) === request.dictionaryReading &&
    row.part_of_speech === request.partOfSpeech,
  ) ?? null;
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

async function loadKanjiAndGrammar(
  client: SupabaseClient<Database>,
  characters: string[],
  patterns: string[],
): Promise<{ kanji: KanjiRow[]; grammar: GrammarRow[] }> {
  const [kanji, grammar] = await Promise.all([
    client
      .from("kanji_records")
      .select("*")
      .in("character", characters)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
    client
      .from("grammar_records")
      .select("*")
      .in("pattern", patterns)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
  ]);
  const error = kanji.error ?? grammar.error;
  if (error) throw new Error(`Language library could not be loaded: ${error.message}`);
  return { kanji: kanji.data ?? [], grammar: grammar.data ?? [] };
}

async function loadVocabulary(
  client: SupabaseClient<Database>,
  dictionaryForms: string[],
): Promise<VocabularyRow[]> {
  const rawClient = client as unknown as SupabaseClient;
  const result = await rawClient
    .from("vocabulary_records")
    .select("*")
    .in("dictionary_form", dictionaryForms)
    .is("archived_at", null)
    .neq("quality_status", "rejected");
  if (result.error) throw new Error(`Vocabulary library could not be loaded: ${result.error.message}`);
  return (result.data ?? []) as VocabularyRow[];
}

function linkedKanjiCharacters(
  dictionaryForm: string,
  allowedCharacters: string[],
): string[] {
  const allowed = new Set(allowedCharacters);
  return [...new Set(
    (dictionaryForm.match(/\p{Script=Han}/gu) ?? [])
      .filter((character) => allowed.has(character)),
  )];
}

/**
 * API call 2. It tokenizes the fixed story, supplies canonical kana/meaning,
 * and returns metadata needed to insert only genuinely missing library rows.
 */
export async function enrichStoryAndResolveLibraryV3(
  client: SupabaseClient<Database>,
  input: {
    topic: string;
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
  let records = await loadKanjiAndGrammar(client, characters, patterns);
  const unknownKanji = characters.filter(
    (character) => !records.kanji.some((row) => row.character === character),
  );
  const unknownGrammar = input.plan.grammar.filter(
    (target) => !records.grammar.some(
      (row) => row.pattern === target.pattern && row.jlpt_level === target.level,
    ),
  );

  const prompt = [
    "This is AIko API call 2: enrich the fixed story for the permanent Japanese library.",
    "Do not rewrite, shorten, extend, or correct the story lines.",
    `JLPT ceiling: ${input.level}. Custom topic: ${input.topic}.`,
    `Fixed story: ${JSON.stringify(input.draft.lines.map((line, lineIndex) => ({ lineIndex, ...line })))}`,
    `Missing kanji requests: ${JSON.stringify(unknownKanji.map((character, requestIndex) => ({ requestIndex, character })))}`,
    `Missing grammar requests: ${JSON.stringify(unknownGrammar.map((item, requestIndex) => ({ requestIndex, pattern: item.pattern })))}`,
    "For every story line, return every reusable content word in exact occurrence order. Exclude punctuation, standalone particles, and standalone auxiliaries.",
    "surface and readingHint describe the exact observed story form. dictionaryForm and dictionaryReading describe the canonical base word.",
    "Return the exact verb conjugation class. Non-verbs use an empty conjugationType.",
    "dictionaryAlias is empty unless the observed form uses a genuine alternate dictionary spelling of the same lemma. Never use a synonym, related word, or conjugated form as an alias.",
    "Supply concise English meaning, tags, and a natural Japanese example for each canonical word. These fields are used only when the canonical word is missing from the library.",
    "Cover every kanji appearing in the fixed story inside at least one returned content-word surface so AIko can display its reading when the learner does not know it.",
    "For kanji and grammar metadata, return only requestIndex and descriptive metadata. The server restores the permanent identifiers.",
  ].join("\n");

  const generated = await generateStructured<RawStoryEnrichment>({
    name: "story lexical enrichment",
    prompt,
    schema: enrichmentSchema({
      lineCount: input.draft.lines.length,
      unknownKanjiCount: unknownKanji.length,
      unknownGrammarCount: unknownGrammar.length,
    }),
    validate: (value) => enrichmentIssues(
      value,
      input.draft,
      unknownKanji.length,
      unknownGrammar.length,
    ),
  });

  const orderedLines = [...generated.value.lines].sort(
    (left, right) => left.lineIndex - right.lineIndex,
  );
  const draft: StoryDraft = {
    ...input.draft,
    lines: input.draft.lines.map((line, lineIndex) => ({
      ...line,
      terms: orderedLines.find((item) => item.lineIndex === lineIndex)?.terms ?? [],
    })),
  };

  const occurrences = draft.lines.flatMap((line, lineIndex) =>
    line.terms.map((term) => {
      const enriched = term as RawEnrichedTerm;
      return {
        term: enriched,
        morphology: morphologyForTerm(enriched),
        contextJapanese: line.japanese,
        contextEnglish: line.english,
        lineIndex,
      };
    }),
  );
  const requests: VocabularyRequest[] = uniqueBy(
    occurrences.map((item) => ({
      ...item.morphology,
      meaning: item.term.meaning,
      tags: item.term.tags,
      exampleSentence: item.term.exampleSentence,
      contextJapanese: item.contextJapanese,
      contextEnglish: item.contextEnglish,
      observedSurfaces: occurrences
        .filter((candidate) => morphologyKey(candidate.morphology) === morphologyKey(item.morphology))
        .map((candidate) => normalizeJapanese(candidate.term.surface)),
    })),
    morphologyKey,
  );
  const dictionaryForms = requests.map((item) => item.dictionaryForm);
  let vocabularyRows = await loadVocabulary(client, dictionaryForms);
  const missingVocabulary = requests.filter(
    (request) => !matchingVocabularyRow(vocabularyRows, request),
  );

  const rawClient = client as unknown as SupabaseClient;
  if (unknownKanji.length > 0 || unknownGrammar.length > 0 || missingVocabulary.length > 0) {
    const kanjiSeed = generated.value.kanji.map((item) => ({
      character: unknownKanji[item.requestIndex]!,
      meanings: item.meanings,
      readings: item.readings,
      onyomi: item.onyomi,
      kunyomi: item.kunyomi,
      exampleWords: item.exampleWords,
      strokeCount: item.strokeCount,
    }));
    const grammarSeed = generated.value.grammar.map((item) => ({
      pattern: unknownGrammar[item.requestIndex]!.pattern,
      meaning: item.meaning,
      formation: item.formation,
      usageNotes: item.usageNotes,
      nuance: item.nuance,
      exampleSentences: item.exampleSentences,
    }));
    const vocabularySeed = missingVocabulary.map((request) => ({
      writtenForm: request.dictionaryForm,
      reading: request.dictionaryReading,
      meaning: request.meaning,
      partOfSpeech: request.partOfSpeech,
      tags: request.tags,
      exampleSentence: request.exampleSentence || request.contextJapanese,
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

    const stored = await rawClient.rpc("enrich_custom_lesson_library_v3", {
      p_level: input.level,
      p_seed: {
        kanji: kanjiSeed,
        grammar: grammarSeed,
        vocabulary: vocabularySeed,
      } as unknown as Json,
      p_source_model: generated.model,
    });
    if (stored.error) {
      throw new Error(`Missing language records could not be saved: ${stored.error.message}`);
    }
    records = await loadKanjiAndGrammar(client, characters, patterns);
    vocabularyRows = await loadVocabulary(client, dictionaryForms);
  }

  const kanji = input.plan.kanji.map((target) => {
    const row = records.kanji.find((item) => item.character === target.character);
    if (!row) throw new Error(`Kanji library record missing for ${target.character}.`);
    return canonicalKanji(row);
  });
  const grammar = input.plan.grammar.map((target) => {
    const row = records.grammar.find(
      (item) => item.pattern === target.pattern && item.jlpt_level === target.level,
    ) ?? records.grammar.find((item) => item.pattern === target.pattern);
    if (!row) throw new Error(`Grammar library record missing for ${target.pattern}.`);
    return canonicalGrammar(row);
  });

  const vocabulary: CanonicalVocabulary[] = [];
  const normalizedDraft: StoryDraft = {
    ...draft,
    lines: draft.lines.map((line) => ({
      ...line,
      terms: line.terms.map((term) => {
        const enriched = term as RawEnrichedTerm;
        const morphology = morphologyForTerm(enriched);
        const row = matchingVocabularyRow(vocabularyRows, morphology);
        if (!row) {
          throw new Error(`Vocabulary library record missing for ${morphology.dictionaryForm}.`);
        }
        const entry = lexiconEntry(row);
        const candidates = lookupSurface([entry], enriched.surface).filter(
          (candidate) =>
            candidate.form.kana === normalizeJapanese(enriched.readingHint) &&
            (morphology.dictionaryAlias
              ? candidate.matchedThroughAlias &&
                candidate.matchedSpelling === morphology.dictionaryAlias
              : !candidate.matchedThroughAlias),
        );
        if (candidates.length < 1) {
          throw new Error(
            `${enriched.surface} cannot be reproduced from ${canonicalSurface(entry.kanji, entry.kana)}.`,
          );
        }
        const selected = candidates[0]!;
        vocabulary.push(
          canonicalVocabulary(
            row,
            normalizeJapanese(enriched.surface),
            selected.form.kana,
          ),
        );
        return {
          surface: normalizeJapanese(enriched.surface),
          readingHint: selected.form.kana,
          scriptType: storyWordScript(enriched.surface),
          dictionaryForm: morphology.dictionaryForm,
          dictionaryReading: morphology.dictionaryReading,
          partOfSpeech: morphology.partOfSpeech,
          conjugationType: morphology.conjugationType ?? "",
          dictionaryAlias: morphology.dictionaryAlias,
        } as StoryDraft["lines"][number]["terms"][number];
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
    audits: [{
      stage: "library",
      model: generated.model,
      repaired: generated.repaired,
    }],
  };
}
