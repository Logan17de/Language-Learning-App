export const LEARNED_MASTERY_THRESHOLD = 80;
export const LOW_MASTERY_POOL_SIZE = 10;

export interface MasteryTargetCandidate<T> {
  value: T;
  mastery: number;
  requestedLevel: boolean;
  sourceOrder: number;
  selectionSeed: string;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Select lesson targets only from items that are not learned yet.
 *
 * 1. Mastery >= 80 is learned and excluded.
 * 2. Rank remaining items by mastery ascending (unseen callers pass 0).
 * 3. Keep only the lowest 10.
 * 4. Choose the requested number from that pool with a stable per-lesson hash
 *    so repeated topics do not always receive the exact same first items.
 */
export function selectFromLowestMasteryPool<T>(
  candidates: MasteryTargetCandidate<T>[],
  count: number,
): T[] {
  const pool = candidates
    .filter((candidate) => candidate.mastery < LEARNED_MASTERY_THRESHOLD)
    .sort((left, right) => {
      const masteryDifference = left.mastery - right.mastery;
      if (masteryDifference !== 0) return masteryDifference;
      if (left.requestedLevel !== right.requestedLevel) {
        return left.requestedLevel ? -1 : 1;
      }
      return left.sourceOrder - right.sourceOrder;
    })
    .slice(0, LOW_MASTERY_POOL_SIZE);

  return pool
    .map((candidate) => ({
      candidate,
      hash: stableHash(candidate.selectionSeed),
    }))
    .sort((left, right) => left.hash - right.hash)
    .slice(0, count)
    .map(({ candidate }) => candidate.value);
}

/**
 * Select lesson targets at random from one level, ignoring mastery.
 *
 * Used when a learner deliberately asks for a level BELOW their own. There the
 * normal rule cannot work: they have usually already mastered that level, so
 * filtering to mastery < 80 empties the pool and generation fails with
 * "Not enough unlearned targets". A revision lesson is not meant to hunt for
 * weak spots anyway, so every item at that level is a fair candidate.
 *
 * Selection stays deterministic through the same per-lesson seed, so one topic
 * reliably produces one lesson while different topics vary.
 */
export function selectRandomLevelTargets<T>(
  candidates: MasteryTargetCandidate<T>[],
  count: number,
): T[] {
  return candidates
    .filter((candidate) => candidate.requestedLevel)
    .map((candidate) => ({
      candidate,
      hash: stableHash(candidate.selectionSeed),
    }))
    .sort((left, right) => left.hash - right.hash)
    .slice(0, count)
    .map(({ candidate }) => candidate.value);
}
