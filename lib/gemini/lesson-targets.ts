import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
import type {
  GrammarTarget,
  KanjiTarget,
  SelectedLessonTargets,
  VocabularyLibraryItem,
} from "@/lib/gemini/lesson-types";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

interface MasteryValue {
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

function masteryFor(keys: Array<string | null>, mastery: Map<string, MasteryValue>): MasteryValue | null {
  for (const key of keys) {
    if (key && mastery.has(key)) return mastery.get(key) ?? null;
  }
  return null;
}

function targetPriority(
  itemLevel: JLPTLevel,
  currentLevel: JLPTLevel,
  mastery: MasteryValue | null,
  seed: string,
): [number, number, number, number] {
  const weakOrUnknown = !mastery || mastery.evidenceCount === 0 || mastery.mastery < 75;
  const weakKnown = mastery && mastery.evidenceCount > 0 && mastery.mastery < 75;
  return [
    weakKnown ? 0 : weakOrUnknown ? 1 : 2,
    itemLevel === currentLevel ? 0 : 1,
    mastery?.mastery ?? 50,
    stableHash(seed),
  ];
}

function compareTuple(left: number[], right: number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export async function selectLessonTargets(
  client: SupabaseClient<Database>,
  userId: string,
  level: JLPTLevel,
  topic: string,
  interests: string[],
): Promise<SelectedLessonTargets> {
  const levels = allowedLevels(level);
  const [kanjiResult, grammarResult, vocabularyResult, masteryResult] = await Promise.all([
    client
      .from("kanji_records")
      .select("id,legacy_id,character,jlpt_level,meanings,readings,archived_at")
      .in("jlpt_level", levels)
      .is("archived_at", null)
      .limit(1000),
    client
      .from("grammar_records")
      .select("id,legacy_id,pattern,jlpt_level,meaning,formation,usage_notes,nuance,example_sentences,archived_at")
      .in("jlpt_level", levels)
      .is("archived_at", null)
      .limit(500),
    client
      .from("vocabulary_records")
      .select("id,legacy_id,written_form,reading,meaning,part_of_speech,jlpt_level,tags,example_sentence,linked_kanji_ids,archived_at")
      .in("jlpt_level", levels)
      .is("archived_at", null)
      .limit(1000),
    client
      .from("learner_mastery")
      .select("item_type,item_key,mastery,evidence_count")
      .eq("user_id", userId)
      .in("item_type", ["kanji", "grammar"]),
  ]);

  const libraryError = kanjiResult.error ?? grammarResult.error ?? vocabularyResult.error ?? masteryResult.error;
  if (libraryError) throw new Error(`The lesson library could not be loaded: ${libraryError.message}`);

  const kanjiMastery = new Map<string, MasteryValue>();
  const grammarMastery = new Map<string, MasteryValue>();
  for (const row of masteryResult.data ?? []) {
    const target = row.item_type === "kanji" ? kanjiMastery : row.item_type === "grammar" ? grammarMastery : null;
    if (target) target.set(row.item_key, { mastery: row.mastery, evidenceCount: row.evidence_count });
  }

  const rankedKanji = (kanjiResult.data ?? []).map((row) => {
    const mastery = masteryFor([row.id, row.legacy_id, row.character], kanjiMastery);
    const target: KanjiTarget = {
      id: row.id,
      legacyId: row.legacy_id,
      character: row.character,
      level: row.jlpt_level,
      meanings: row.meanings,
      readings: row.readings,
      isKnown: Boolean(mastery && mastery.evidenceCount > 0),
      mastery: mastery?.mastery ?? null,
    };
    return {
      target,
      priority: targetPriority(row.jlpt_level, level, mastery, `${userId}:${topic}:kanji:${row.id}`),
    };
  }).sort((left, right) => compareTuple(left.priority, right.priority));

  const rankedGrammar = (grammarResult.data ?? []).map((row) => {
    const mastery = masteryFor([row.id, row.legacy_id, row.pattern], grammarMastery);
    const target: GrammarTarget = {
      id: row.id,
      legacyId: row.legacy_id,
      pattern: row.pattern,
      level: row.jlpt_level,
      meaning: row.meaning,
      formation: row.formation,
      usageNotes: row.usage_notes,
      nuance: row.nuance,
      examples: row.example_sentences,
      isKnown: Boolean(mastery && mastery.evidenceCount > 0),
      mastery: mastery?.mastery ?? null,
    };
    return {
      target,
      priority: targetPriority(row.jlpt_level, level, mastery, `${userId}:${topic}:grammar:${row.id}`),
    };
  }).sort((left, right) => compareTuple(left.priority, right.priority));

  if (rankedKanji.length < 5 || rankedGrammar.length < 3) {
    throw new Error(
      `The ${level} and lower lesson library needs at least 5 kanji and 3 grammar records `
      + `(found ${rankedKanji.length} kanji and ${rankedGrammar.length} grammar).`,
    );
  }

  const kanji = rankedKanji.slice(0, 5).map((item) => item.target);
  const grammar = rankedGrammar.slice(0, 3).map((item) => item.target);
  const targetKanjiIds = new Set(kanji.flatMap((item) => [item.id, item.legacyId].filter(Boolean)));
  const searchTerms = [topic, ...interests].join(" ").toLocaleLowerCase();

  const vocabulary = (vocabularyResult.data ?? [])
    .map((row) => {
      const linkedTarget = row.linked_kanji_ids.some((id) => targetKanjiIds.has(id))
        || kanji.some((item) => row.written_form.includes(item.character));
      const topical = row.tags.some((tag) => searchTerms.includes(tag.toLocaleLowerCase()))
        || searchTerms.includes(row.written_form.toLocaleLowerCase())
        || searchTerms.includes(row.meaning.toLocaleLowerCase());
      const item: VocabularyLibraryItem = {
        id: row.id,
        legacyId: row.legacy_id,
        writtenForm: row.written_form,
        reading: row.reading,
        meaning: row.meaning,
        partOfSpeech: row.part_of_speech,
        level: row.jlpt_level,
        tags: row.tags,
        exampleSentence: row.example_sentence,
        linkedKanjiIds: row.linked_kanji_ids,
      };
      return {
        item,
        priority: [
          linkedTarget ? 0 : topical ? 1 : 2,
          row.jlpt_level === level ? 0 : 1,
          stableHash(`${topic}:vocabulary:${row.id}`),
        ],
      };
    })
    .sort((left, right) => compareTuple(left.priority, right.priority))
    .slice(0, 180)
    .map(({ item }) => item);

  if (vocabulary.length < 20) {
    throw new Error(
      `The ${level} and lower vocabulary library needs at least 20 active records (found ${vocabulary.length}).`,
    );
  }

  const knownKanji = rankedKanji
    .filter((item) => item.target.isKnown)
    .map((item) => item.target.character);

  return { kanji, grammar, vocabulary, knownKanji };
}
