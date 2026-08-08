import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type LessonGenerationLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const TARGET_KANJI_COUNT = 5;
const TARGET_GRAMMAR_COUNT = 3;
const MAX_BATCH_LESSONS = 100;

type RawClient = SupabaseClient;
type AnyRecord = Record<string, unknown>;

export type TargetCapacity = {
  catalogCount: number;
  totalCombinations: string;
  usedCombinations: number;
  availableCombinations: string;
};

export type LessonTargetCapacity = {
  level: LessonGenerationLevel;
  kanji: TargetCapacity;
  grammar: TargetCapacity;
  maxAvailableLessons: string;
  maxSelectableLessons: number;
};

function record(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function signature(values: string[]): string {
  return [...values]
    .sort((left, right) => left.localeCompare(right, "ja"))
    .join("\u0000");
}

export function combinationCount(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0n;
  }
  const choose = Math.min(k, n - k);
  let result = 1n;
  for (let index = 1; index <= choose; index += 1) {
    result = (result * BigInt(n - choose + index)) / BigInt(index);
  }
  return result;
}

function capacityFor(input: {
  keys: string[];
  targetCount: number;
  historicalSets: string[][];
}): TargetCapacity {
  const usable = new Set(input.keys);
  const used = new Set<string>();

  for (const values of input.historicalSets) {
    if (
      values.length === input.targetCount &&
      new Set(values).size === input.targetCount &&
      values.every((value) => usable.has(value))
    ) {
      used.add(signature(values));
    }
  }

  const total = combinationCount(usable.size, input.targetCount);
  const available = total > BigInt(used.size) ? total - BigInt(used.size) : 0n;

  return {
    catalogCount: usable.size,
    totalCombinations: total.toString(),
    usedCombinations: used.size,
    availableCombinations: available.toString(),
  };
}

export async function getLessonTargetCapacity(
  level: LessonGenerationLevel,
): Promise<LessonTargetCapacity> {
  const admin = createAdminClient() as unknown as RawClient;
  const [kanjiResult, grammarResult, historyResult] = await Promise.all([
    admin
      .from("kanji_records")
      .select("character,quality_status,archived_at")
      .eq("jlpt_level", level)
      .is("archived_at", null),
    admin
      .from("grammar_records")
      .select("pattern,quality_status,archived_at")
      .eq("jlpt_level", level)
      .is("archived_at", null),
    admin
      .from("lesson_generation_requests")
      .select("target_kanji,target_grammar")
      .eq("jlpt_level", level),
  ]);

  const error = kanjiResult.error || grammarResult.error || historyResult.error;
  if (error) throw new Error(error.message);

  const kanjiKeys = [...new Set(
    (kanjiResult.data ?? [])
      .filter((row) => record(row) && row.quality_status !== "rejected" && text(row.character))
      .map((row) => text(row.character) as string),
  )];
  const grammarKeys = [...new Set(
    (grammarResult.data ?? [])
      .filter((row) => record(row) && row.quality_status !== "rejected" && text(row.pattern))
      .map((row) => text(row.pattern) as string),
  )];

  const history = (historyResult.data ?? []).filter(record);
  const kanji = capacityFor({
    keys: kanjiKeys,
    targetCount: TARGET_KANJI_COUNT,
    historicalSets: history.map((row) => strings(row.target_kanji)),
  });
  const grammar = capacityFor({
    keys: grammarKeys,
    targetCount: TARGET_GRAMMAR_COUNT,
    historicalSets: history.map((row) => strings(row.target_grammar)),
  });

  const availableKanji = BigInt(kanji.availableCombinations);
  const availableGrammar = BigInt(grammar.availableCombinations);
  const maxAvailable = availableKanji < availableGrammar ? availableKanji : availableGrammar;
  const maxSelectable = maxAvailable < BigInt(MAX_BATCH_LESSONS)
    ? Number(maxAvailable)
    : MAX_BATCH_LESSONS;

  return {
    level,
    kanji,
    grammar,
    maxAvailableLessons: maxAvailable.toString(),
    maxSelectableLessons: maxSelectable,
  };
}

export function assertLessonTargetCapacity(
  capacity: LessonTargetCapacity,
  requestedCount: number,
): void {
  if (requestedCount <= capacity.maxSelectableLessons) return;

  const grammarLimited =
    BigInt(capacity.grammar.availableCombinations) <=
    BigInt(capacity.kanji.availableCombinations);
  const limiting = grammarLimited ? "grammar" : "kanji";
  const targetSize = grammarLimited ? TARGET_GRAMMAR_COUNT : TARGET_KANJI_COUNT;
  const targetCapacity = grammarLimited ? capacity.grammar : capacity.kanji;

  throw new Error(
    `${capacity.level} cannot create ${requestedCount} new unique lessons with the current DB targets. ` +
      `Only ${capacity.maxAvailableLessons} unique lesson target set(s) remain. ` +
      `${capacity.level} has ${targetCapacity.catalogCount} usable ${limiting} records, giving ` +
      `${targetCapacity.totalCombinations} total ${targetSize}-${limiting} combinations; ` +
      `${targetCapacity.usedCombinations} are already reserved and ` +
      `${targetCapacity.availableCombinations} remain. ` +
      `Add more ${capacity.level} ${limiting} records or request ${capacity.maxSelectableLessons} or fewer lessons.`,
  );
}
