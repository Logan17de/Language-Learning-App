import "server-only";

import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { JLPTLevel } from "@/types/lesson";
import type { LessonPlanV3 } from "@/lib/gemini/story-pipeline-v3";

const LEVELS: JLPTLevel[] = ["N5", "N4", "N3", "N2", "N1"];

interface Mastery {
  mastery: number;
  evidenceCount: number;
}

interface InterestRow {
  interests: string[];
}

interface ExposureRow {
  character: string;
  appearance_count: number;
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

function normalizedInterests(...sources: unknown[]): string[] {
  const values = sources.flatMap((source) =>
    Array.isArray(source)
      ? source.filter((item): item is string => typeof item === "string")
      : [],
  );
  return [...new Set(
    values.map((item) => item.normalize("NFKC").trim()).filter(Boolean),
  )].slice(0, 8);
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
 * Static catalogs are cached for fifteen minutes. Learner mastery, interests,
 * and kanji exposure remain live and are fetched in parallel for every request.
 */
export async function selectLessonPlanV3(
  client: SupabaseClient<Database>,
  userId: string,
  topic: string,
  level: JLPTLevel,
): Promise<LessonPlanV3> {
  const levels = allowedLevels(level);
  const rawClient = client as unknown as SupabaseClient;
  const [catalog, masteryResult, preferenceResult, profileResult, exposureResult] = await Promise.all([
    cachedCatalogSnapshot(levels.join(",")),
    client
      .from("learner_mastery")
      .select("item_type,item_key,mastery,evidence_count")
      .eq("user_id", userId)
      .in("item_type", ["kanji", "grammar"]),
    rawClient
      .from("user_preferences")
      .select("interests")
      .eq("user_id", userId)
      .maybeSingle(),
    rawClient
      .from("profiles")
      .select("interests")
      .eq("id", userId)
      .maybeSingle(),
    rawClient
      .from("learner_kanji_exposure_progress")
      .select("character,appearance_count")
      .eq("user_id", userId)
      .gte("appearance_count", 10),
  ]);

  const firstError = [masteryResult, preferenceResult, profileResult, exposureResult]
    .find((result) => result.error)?.error;
  if (firstError) {
    throw new Error(`Lesson targets could not be loaded: ${firstError.message}`);
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
    target.set(key, {
      mastery: row.mastery,
      evidenceCount: row.evidence_count,
    });
  }

  const kanji = catalog.kanjiCatalog
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
    .map(({ character, level: itemLevel }) => ({ character, level: itemLevel }));

  const grammar = catalog.grammarCatalog
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
    .map(({ pattern, level: itemLevel }) => ({ pattern, level: itemLevel }));

  if (kanji.length !== 5 || grammar.length !== 3) {
    throw new Error(
      `Import the ${level} kanji and grammar catalogs before generating lessons.`,
    );
  }

  const knownKanji = ((exposureResult.data ?? []) as ExposureRow[])
    .filter((row) => row.appearance_count >= 10)
    .map((row) => row.character);
  const preferences = preferenceResult.data as InterestRow | null;
  const profile = profileResult.data as InterestRow | null;
  const interests = normalizedInterests(preferences?.interests, profile?.interests);

  return { kanji, grammar, knownKanji, interests };
}
