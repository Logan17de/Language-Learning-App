import "server-only";

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
import type { LessonPlanV3 } from "@/lib/gemini/story-pipeline-v3";
import {
  LEARNED_MASTERY_THRESHOLD,
  selectFromLowestMasteryPool,
  selectRandomLevelTargets,
} from "@/lib/mastery-target-selection";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

interface Mastery {
  mastery: number;
}

interface CatalogSnapshot {
  kanjiCatalog: Array<{
    character: string;
    jlpt_level: JLPTLevel;
    source_order: number;
  }>;
  grammarCatalog: Array<{
    pattern: string;
    jlpt_level: JLPTLevel;
    source_order: number;
  }>;
  kanjiDetails: Array<{
    id: string;
    legacy_id: string | null;
    character: string;
    jlpt_level: JLPTLevel;
  }>;
  grammarDetails: Array<{
    id: string;
    legacy_id: string | null;
    pattern: string;
    jlpt_level: JLPTLevel;
  }>;
}

function allowedLevels(level: JLPTLevel): JLPTLevel[] {
  return LEVELS.slice(0, LEVELS.indexOf(level) + 1);
}

const cachedCatalogSnapshot = unstable_cache(
  async (levelKey: string): Promise<CatalogSnapshot> => {
    const levels = levelKey.split(",") as JLPTLevel[];
    const admin = createAdminClient() as unknown as SupabaseClient<Database>;
    const [kanjiCatalog, grammarCatalog, kanjiDetails, grammarDetails] = await Promise.all([
      admin
        .from("kanji_catalog")
        .select("character,jlpt_level,source_order")
        .in("jlpt_level", levels)
        .eq("active", true)
        .limit(2500),
      admin
        .from("grammar_catalog")
        .select("pattern,jlpt_level,source_order")
        .in("jlpt_level", levels)
        .eq("active", true)
        .limit(800),
      admin
        .from("kanji_records")
        .select("id,legacy_id,character,jlpt_level")
        .in("jlpt_level", levels)
        .is("archived_at", null)
        .neq("quality_status", "rejected")
        .limit(2500),
      admin
        .from("grammar_records")
        .select("id,legacy_id,pattern,jlpt_level")
        .in("jlpt_level", levels)
        .is("archived_at", null)
        .neq("quality_status", "rejected")
        .limit(800),
    ]);
    const error = kanjiCatalog.error ?? grammarCatalog.error ?? kanjiDetails.error ?? grammarDetails.error;
    if (error) throw new Error(`Lesson catalog could not be loaded: ${error.message}`);
    return {
      kanjiCatalog: (kanjiCatalog.data ?? []) as CatalogSnapshot["kanjiCatalog"],
      grammarCatalog: (grammarCatalog.data ?? []) as CatalogSnapshot["grammarCatalog"],
      kanjiDetails: (kanjiDetails.data ?? []) as CatalogSnapshot["kanjiDetails"],
      grammarDetails: (grammarDetails.data ?? []) as CatalogSnapshot["grammarDetails"],
    };
  },
  ["lesson-plan-v3-static-catalog"],
  { revalidate: 900 },
);

/**
 * Static catalogs are cached for fifteen minutes. Learner mastery remains live
 * and is fetched for every request.
 *
 * Learned means mastery >= 80. Learned kanji/grammar are never selected as new
 * lesson targets. Each lesson chooses from the ten lowest-mastery eligible
 * items: five kanji and three grammar patterns.
 */
export async function selectLessonPlanV3(
  client: SupabaseClient<Database>,
  userId: string,
  topic: string,
  level: JLPTLevel,
): Promise<LessonPlanV3> {
  const levels = allowedLevels(level);
  const [catalog, masteryResult, profileResult] = await Promise.all([
    cachedCatalogSnapshot(levels.join(",")),
    client
      .from("learner_mastery")
      .select("item_type,item_key,mastery")
      .eq("user_id", userId)
      .in("item_type", ["kanji", "grammar"]),
    client
      .from("profiles")
      .select("current_jlpt_level")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (masteryResult.error) {
    throw new Error(`Lesson targets could not be loaded: ${masteryResult.error.message}`);
  }

  const kanjiKeys = new Map<string, string>();
  for (const row of catalog.kanjiDetails) {
    kanjiKeys.set(row.id, row.character);
    if (row.legacy_id) kanjiKeys.set(row.legacy_id, row.character);
    kanjiKeys.set(row.character, row.character);
  }
  const grammarKeys = new Map<string, string>();
  for (const row of catalog.grammarDetails) {
    grammarKeys.set(row.id, row.pattern);
    if (row.legacy_id) grammarKeys.set(row.legacy_id, row.pattern);
    grammarKeys.set(row.pattern, row.pattern);
  }

  const kanjiMastery = new Map<string, Mastery>();
  const grammarMastery = new Map<string, Mastery>();
  for (const row of masteryResult.data ?? []) {
    const key = row.item_type === "kanji"
      ? kanjiKeys.get(row.item_key)
      : grammarKeys.get(row.item_key);
    if (!key) continue;
    const target = row.item_type === "kanji" ? kanjiMastery : grammarMastery;
    target.set(key, { mastery: row.mastery });
  }

  // A lesson deliberately requested below the learner's own level is revision:
  // those items are usually already at or above the learned threshold, so the
  // unlearned-pool rule would find nothing. Pick across the level at random
  // instead. At or above their level, the normal weakest-first rule applies.
  const learnerLevel = (profileResult.data?.current_jlpt_level ??
    level) as JLPTLevel;
  const isRevisionLevel = LEVELS.indexOf(level) < LEVELS.indexOf(learnerLevel);
  const selectTargets = isRevisionLevel
    ? selectRandomLevelTargets
    : selectFromLowestMasteryPool;

  const kanji = selectTargets(
    catalog.kanjiCatalog.map((row) => ({
      value: { character: row.character, level: row.jlpt_level },
      mastery: kanjiMastery.get(row.character)?.mastery ?? 0,
      requestedLevel: row.jlpt_level === level,
      sourceOrder: row.source_order,
      selectionSeed: `${userId}:${topic}:kanji:${row.character}`,
    })),
    5,
  );

  const grammar = selectTargets(
    catalog.grammarCatalog.map((row) => ({
      value: { pattern: row.pattern, level: row.jlpt_level },
      mastery: grammarMastery.get(row.pattern)?.mastery ?? 0,
      requestedLevel: row.jlpt_level === level,
      sourceOrder: row.source_order,
      selectionSeed: `${userId}:${topic}:grammar:${row.pattern}`,
    })),
    3,
  );

  if (kanji.length !== 5 || grammar.length !== 3) {
    throw new Error(
      isRevisionLevel
        ? `The ${level} catalog does not have enough targets to build a revision lesson.`
        : `Not enough unlearned ${level} lesson targets remain below ${LEARNED_MASTERY_THRESHOLD}% mastery.`,
    );
  }

  const knownKanji = [...kanjiMastery.entries()]
    .filter(([, mastery]) => mastery.mastery >= LEARNED_MASTERY_THRESHOLD)
    .map(([character]) => character);

  return { kanji, grammar, knownKanji };
}
