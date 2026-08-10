import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  MAX_BATCH_LESSONS,
  TARGET_KANJI_COUNT,
  type SupportedBatchLevel,
} from "@/lib/admin-lessons/lesson-generation-contract";

export type LessonGenerationLevel = SupportedBatchLevel;

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
  maxAvailableLessons: string;
  maxSelectableLessons: number;
};

function record(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function combinationCount(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return BigInt(0);
  }
  const choose = Math.min(k, n - k);
  let result = BigInt(1);
  for (let index = 1; index <= choose; index += 1) {
    result = (result * BigInt(n - choose + index)) / BigInt(index);
  }
  return result;
}

export async function getLessonTargetCapacity(
  level: LessonGenerationLevel,
): Promise<LessonTargetCapacity> {
  const admin = createAdminClient() as unknown as RawClient;
  const [kanjiResult, reservationResult] = await Promise.all([
    admin
      .from("kanji_catalog")
      .select("character")
      .eq("jlpt_level", level)
      .eq("active", true),
    admin
      .from("lesson_generation_kanji_reservations")
      .select("id", { count: "exact", head: true })
      .eq("jlpt_level", level),
  ]);

  const error = kanjiResult.error || reservationResult.error;
  if (error) throw new Error(error.message);

  const kanjiKeys = [...new Set(
    (kanjiResult.data ?? [])
      .map((row) => record(row) ? text(row.character) : null)
      .filter((value): value is string => typeof value === "string" && [...value].length === 1),
  )];

  const total = combinationCount(kanjiKeys.length, TARGET_KANJI_COUNT);
  const used = reservationResult.count ?? 0;
  const available = total > BigInt(used) ? total - BigInt(used) : BigInt(0);
  const maxSelectable = available < BigInt(MAX_BATCH_LESSONS)
    ? Number(available)
    : MAX_BATCH_LESSONS;

  return {
    level,
    kanji: {
      catalogCount: kanjiKeys.length,
      totalCombinations: total.toString(),
      usedCombinations: used,
      availableCombinations: available.toString(),
    },
    maxAvailableLessons: available.toString(),
    maxSelectableLessons: maxSelectable,
  };
}

export function assertLessonTargetCapacity(
  capacity: LessonTargetCapacity,
  requestedCount: number,
): void {
  if (requestedCount <= capacity.maxSelectableLessons) return;

  throw new Error(
    `${capacity.level} cannot create ${requestedCount} new lessons because only ` +
      `${capacity.maxAvailableLessons} unused five-kanji set(s) remain. ` +
      `${capacity.level} has ${capacity.kanji.catalogCount} active kanji catalog entries, giving ` +
      `${capacity.kanji.totalCombinations} total five-kanji combinations; ` +
      `${capacity.kanji.usedCombinations} are already permanently reserved. ` +
      `Grammar patterns may repeat with different kanji sets and are balanced by usage. ` +
      `Add more ${capacity.level} kanji or request ${capacity.maxSelectableLessons} or fewer lessons.`,
  );
}
