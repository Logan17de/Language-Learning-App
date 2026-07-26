import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
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

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

interface Mastery {
  mastery: number;
  evidenceCount: number;
}

function allowedLevels(level: JLPTLevel): JLPTLevel[] {
  return LEVELS.slice(0, LEVELS.indexOf(level) + 1);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function compare(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function priority(
  itemLevel: JLPTLevel,
  requestedLevel: JLPTLevel,
  mastery: Mastery | undefined,
  seed: string,
): number[] {
  return [
    mastery && mastery.evidenceCount > 0 && mastery.mastery < 75
      ? 0
      : !mastery || mastery.evidenceCount === 0
        ? 1
        : 2,
    itemLevel === requestedLevel ? 0 : 1,
    mastery?.mastery ?? 50,
    stableHash(seed),
  ];
}

export async function selectLessonPlan(
  client: SupabaseClient<Database>,
  userId: string,
  topic: string,
  level: JLPTLevel,
): Promise<LessonPlan> {
  const levels = allowedLevels(level);
  const [
    kanjiCatalog,
    grammarCatalog,
    kanjiDetails,
    grammarDetails,
    masteryResult,
  ] = await Promise.all([
    client
      .from("kanji_catalog")
      .select("character,jlpt_level,source_order")
      .in("jlpt_level", levels)
      .eq("active", true)
      .limit(2500),
    client
      .from("grammar_catalog")
      .select("pattern,jlpt_level,source_order")
      .in("jlpt_level", levels)
      .eq("active", true)
      .limit(800),
    client
      .from("kanji_records")
      .select("id,legacy_id,character,jlpt_level")
      .in("jlpt_level", levels)
      .is("archived_at", null)
      .neq("quality_status", "rejected")
      .limit(2500),
    client
      .from("grammar_records")
      .select("id,legacy_id,pattern,jlpt_level")
      .in("jlpt_level", levels)
      .is("archived_at", null)
      .neq("quality_status", "rejected")
      .limit(800),
    client
      .from("learner_mastery")
      .select("item_type,item_key,mastery,evidence_count")
      .eq("user_id", userId)
      .in("item_type", ["kanji", "grammar"]),
  ]);

  const firstError = [
    kanjiCatalog,
    grammarCatalog,
    kanjiDetails,
    grammarDetails,
    masteryResult,
  ].find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(
      `Lesson targets could not be loaded: ${firstError.message}`,
    );
  }

  const kanjiKeys = new Map<string, string>();
  for (const row of kanjiDetails.data ?? []) {
    kanjiKeys.set(row.id, row.character);
    if (row.legacy_id) kanjiKeys.set(row.legacy_id, row.character);
    kanjiKeys.set(row.character, row.character);
  }
  const grammarKeys = new Map<string, string>();
  for (const row of grammarDetails.data ?? []) {
    grammarKeys.set(row.id, row.pattern);
    if (row.legacy_id) grammarKeys.set(row.legacy_id, row.pattern);
    grammarKeys.set(row.pattern, row.pattern);
  }

  const kanjiMastery = new Map<string, Mastery>();
  const grammarMastery = new Map<string, Mastery>();
  for (const row of masteryResult.data ?? []) {
    const key =
      row.item_type === "kanji"
        ? kanjiKeys.get(row.item_key)
        : grammarKeys.get(row.item_key);
    if (!key) continue;
    const target = row.item_type === "kanji" ? kanjiMastery : grammarMastery;
    target.set(key, {
      mastery: row.mastery,
      evidenceCount: row.evidence_count,
    });
  }

  const kanji = (kanjiCatalog.data ?? [])
    .map((row) => ({
      character: row.character,
      level: row.jlpt_level,
      priority: priority(
        row.jlpt_level,
        level,
        kanjiMastery.get(row.character),
        `${userId}:${topic}:kanji:${row.character}`,
      ),
    }))
    .sort((left, right) => compare(left.priority, right.priority))
    .slice(0, 5)
    .map(({ character, level: itemLevel }) => ({
      character,
      level: itemLevel,
    }));
  const grammar = (grammarCatalog.data ?? [])
    .map((row) => ({
      pattern: row.pattern,
      level: row.jlpt_level,
      priority: priority(
        row.jlpt_level,
        level,
        grammarMastery.get(row.pattern),
        `${userId}:${topic}:grammar:${row.pattern}`,
      ),
    }))
    .sort((left, right) => compare(left.priority, right.priority))
    .slice(0, 3)
    .map(({ pattern, level: itemLevel }) => ({
      pattern,
      level: itemLevel,
    }));

  if (kanji.length !== 5 || grammar.length !== 3) {
    throw new Error(
      `Import the ${level} kanji and grammar catalogs before generating lessons.`,
    );
  }

  const knownKanji = [...kanjiMastery.entries()]
    .filter(([, value]) => value.evidenceCount > 0 && value.mastery >= 75)
    .sort((left, right) => right[1].mastery - left[1].mastery)
    .slice(0, 40)
    .map(([character]) => character)
    .filter(
      (character) => !kanji.some((target) => target.character === character),
    );

  return { kanji, grammar, knownKanji };
}

type KanjiRow = Database["public"]["Tables"]["kanji_records"]["Row"];
type GrammarRow = Database["public"]["Tables"]["grammar_records"]["Row"];
type VocabularyRow = Database["public"]["Tables"]["vocabulary_records"]["Row"];

async function loadRecords(
  client: SupabaseClient<Database>,
  characters: string[],
  patterns: string[],
  writtenForms: string[],
): Promise<{
  kanji: KanjiRow[];
  grammar: GrammarRow[];
  vocabulary: VocabularyRow[];
}> {
  const [kanji, grammar, vocabulary] = await Promise.all([
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
    client
      .from("vocabulary_records")
      .select("*")
      .in("written_form", writtenForms)
      .is("archived_at", null)
      .neq("quality_status", "rejected"),
  ]);
  const firstError = [kanji, grammar, vocabulary].find(
    (result) => result.error,
  )?.error;
  if (firstError) {
    throw new Error(
      `Language library could not be loaded: ${firstError.message}`,
    );
  }
  return {
    kanji: kanji.data ?? [],
    grammar: grammar.data ?? [],
    vocabulary: vocabulary.data ?? [],
  };
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

function contextFor(
  draft: StoryDraft,
  surface: string,
  readingHint: string,
): MissingVocabulary {
  const line =
    draft.lines.find(
      (candidate) =>
        candidate.japanese.includes(surface) &&
        candidate.terms.some(
          (term) =>
            term.surface === surface && term.readingHint === readingHint,
        ),
    ) ?? draft.lines[0];
  return {
    writtenForm: surface,
    readingHint,
    contextJapanese: line?.japanese ?? surface,
    contextEnglish: line?.english ?? "",
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

function canonicalVocabulary(row: VocabularyRow): CanonicalVocabulary {
  return {
    libraryId: row.id,
    term: row.written_form,
    reading: row.reading,
    meaning: row.meaning,
    partOfSpeech: row.part_of_speech,
    level: row.jlpt_level,
    tags: row.tags,
    exampleSentence: row.example_sentence,
    linkedKanjiIds: row.linked_kanji_ids,
  };
}

export async function resolveLessonLibrary(
  client: SupabaseClient<Database>,
  input: {
    topic: string;
    level: JLPTLevel;
    plan: LessonPlan;
    draft: StoryDraft;
  },
): Promise<{
  library: ResolvedLessonLibrary;
  audit: GenerationAuditEntry | null;
}> {
  const characters = uniqueBy(
    [
      ...input.plan.kanji.map((item) => item.character),
      ...input.draft.lines.flatMap(
        (line) => line.japanese.match(/\p{Script=Han}/gu) ?? [],
      ),
    ],
    (item) => item,
  );
  const patterns = input.plan.grammar.map((item) => item.pattern);
  const requestedVocabulary = uniqueBy(
    input.draft.lines.flatMap((line) =>
      line.terms.map((term) => ({
        surface: term.surface,
        readingHint: term.readingHint,
      })),
    ),
    (item) => `${item.surface}:${item.readingHint}`,
  );
  const writtenForms = uniqueBy(
    requestedVocabulary.map((item) => item.surface),
    (item) => item,
  );

  let records = await loadRecords(client, characters, patterns, writtenForms);
  const unknownKanji = characters.filter(
    (character) =>
      !records.kanji.some((record) => record.character === character),
  );
  const unknownGrammar = input.plan.grammar
    .filter(
      (target) =>
        !records.grammar.some(
          (record) =>
            record.pattern === target.pattern &&
            record.jlpt_level === target.level,
        ),
    )
    .map((item) => item.pattern);
  const unknownVocabulary = requestedVocabulary
    .filter(
      (target) =>
        !records.vocabulary.some(
          (record) =>
            record.written_form === target.surface &&
            record.reading === target.readingHint,
        ),
    )
    .map((target) =>
      contextFor(input.draft, target.surface, target.readingHint),
    );

  let audit: GenerationAuditEntry | null = null;
  if (
    unknownKanji.length > 0 ||
    unknownGrammar.length > 0 ||
    unknownVocabulary.length > 0
  ) {
    const enrichment = await generateLibraryEnrichment({
      level: input.level,
      topic: input.topic,
      kanji: unknownKanji,
      allowedKanji: characters,
      grammar: unknownGrammar,
      vocabulary: unknownVocabulary,
    });
    const stored = await client.rpc("enrich_custom_lesson_library_v2", {
      p_level: input.level,
      p_seed: enrichment.seed as unknown as Json,
      p_source_model: enrichment.model,
    });
    if (stored.error) {
      throw new Error(
        `Missing language records could not be saved: ${stored.error.message}`,
      );
    }
    audit = enrichment.audit;
    records = await loadRecords(client, characters, patterns, writtenForms);
  }

  const kanji = input.plan.kanji.map((target) => {
    const row = records.kanji.find(
      (record) => record.character === target.character,
    );
    if (!row) {
      throw new Error(`Kanji library record missing for ${target.character}.`);
    }
    return canonicalKanji(row);
  });
  const grammar = input.plan.grammar.map((target) => {
    const row =
      records.grammar.find(
        (record) =>
          record.pattern === target.pattern &&
          record.jlpt_level === target.level,
      ) ?? records.grammar.find((record) => record.pattern === target.pattern);
    if (!row) {
      throw new Error(`Grammar library record missing for ${target.pattern}.`);
    }
    return canonicalGrammar(row);
  });
  const vocabulary = uniqueBy(
    requestedVocabulary.map((target) => {
      const exact = records.vocabulary.find(
        (record) =>
          record.written_form === target.surface &&
          record.reading === target.readingHint,
      );
      const surfaceMatches = records.vocabulary.filter(
        (record) => record.written_form === target.surface,
      );
      const row =
        exact ?? (surfaceMatches.length === 1 ? surfaceMatches[0] : null);
      if (!row) {
        throw new Error(
          `Vocabulary library record missing for ${target.surface}.`,
        );
      }
      return canonicalVocabulary(row);
    }),
    (item) => item.libraryId,
  );

  return {
    library: { kanji, grammar, vocabulary },
    audit,
  };
}
