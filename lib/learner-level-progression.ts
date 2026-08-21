import type { SupabaseClient } from "@supabase/supabase-js";
import type { JLPTLevel } from "@/types/lesson";

export const LEVEL_SEQUENCE: readonly JLPTLevel[] = [
  "N5",
  "N4",
  "N3",
  "N2",
  "N1",
];

/** The level a learner earns next, or null once they are at the top. */
export function nextLearnerLevel(level: JLPTLevel): JLPTLevel | null {
  const index = LEVEL_SEQUENCE.indexOf(level);
  if (index < 0 || index >= LEVEL_SEQUENCE.length - 1) return null;
  return LEVEL_SEQUENCE[index + 1];
}

export interface LevelPromotion {
  promoted: boolean;
  level: JLPTLevel;
  fromLevel: JLPTLevel | null;
  trackedItems: number;
  masteredItems: number;
}

function asLevel(value: unknown): JLPTLevel | null {
  return LEVEL_SEQUENCE.includes(value as JLPTLevel)
    ? (value as JLPTLevel)
    : null;
}

/**
 * Ask the server whether a promotion has been earned, and claim it if so.
 *
 * The decision is deliberately not made in the browser. The level is earned,
 * so it is server-owned: claim_level_promotion() checks that every item at the
 * learner's current level is mastered, awards each level at most once, and
 * never moves a learner backwards. The browser cannot write
 * profiles.current_jlpt_level at all.
 *
 * The rule is mastery of the current level AND every level below it, so a
 * lapse on an earlier item pauses the next award until it is cleared. It
 * resurfaces on its own: target selection draws from the current level plus
 * every level below and picks the weakest first. Pausing is not demotion - the
 * learner's level never falls.
 */
export async function claimLevelPromotion(
  client: SupabaseClient,
): Promise<LevelPromotion | null> {
  const { data, error } = await client.rpc("claim_level_promotion");
  if (error || !data || typeof data !== "object") return null;

  const row = data as Record<string, unknown>;
  const level = asLevel(row.level);
  if (!level) return null;

  return {
    promoted: row.promoted === true,
    level,
    fromLevel: asLevel(row.fromLevel),
    trackedItems: Number(row.trackedItems ?? 0),
    masteredItems: Number(row.masteredItems ?? 0),
  };
}
