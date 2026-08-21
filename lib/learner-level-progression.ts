import type { SupabaseClient } from "@supabase/supabase-js";
import { LEARNED_MASTERY_THRESHOLD } from "@/lib/mastery-target-selection";
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

export interface LevelProgress {
  level: JLPTLevel;
  nextLevel: JLPTLevel | null;
  trackedItems: number;
  masteredItems: number;
  remainingItems: number;
  eligible: boolean;
}

/**
 * Decide whether a learner has earned the next JLPT level.
 *
 * A level is complete when every tracked item at that level has reached the
 * learned threshold. That reduces to a single counted query because
 * sync_level_scoped_mastery_profile() already seeds one learner_mastery row per
 * item for every level up to the learner's own, scoring items BELOW their level
 * as 100 and items AT their level as 0. So any row still under the threshold is
 * an item at the current level they have not mastered yet, and "no rows under
 * the threshold" is exactly the promotion condition.
 *
 * Counting rather than fetching also keeps this correct for the larger levels:
 * N1 alone tracks well over a thousand kanji, which a row fetch would truncate
 * against the API row limit.
 */
export async function evaluateLevelProgress(
  client: SupabaseClient,
  userId: string,
  level: JLPTLevel,
): Promise<LevelProgress | null> {
  const [tracked, remaining] = await Promise.all([
    client
      .from("learner_mastery")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    client
      .from("learner_mastery")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lt("mastery", LEARNED_MASTERY_THRESHOLD),
  ]);

  if (tracked.error || remaining.error) return null;

  const trackedItems = tracked.count ?? 0;
  const remainingItems = remaining.count ?? 0;
  const upcoming = nextLearnerLevel(level);

  return {
    level,
    nextLevel: upcoming,
    trackedItems,
    masteredItems: Math.max(0, trackedItems - remainingItems),
    remainingItems,
    // A learner with nothing tracked yet has not earned anything.
    eligible: trackedItems > 0 && remainingItems === 0 && upcoming !== null,
  };
}
