import { describe, expect, it } from "vitest";
import {
  evaluateLevelProgress,
  nextLearnerLevel,
  LEVEL_SEQUENCE,
} from "@/lib/learner-level-progression";
import { selectRandomLevelTargets } from "@/lib/mastery-target-selection";

/** Minimal stand-in for the counted learner_mastery queries. */
function masteryClient(tracked: number, belowThreshold: number) {
  return {
    from() {
      return {
        select() {
          const chain = {
            filteredByMastery: false,
            eq() {
              return chain;
            },
            lt() {
              chain.filteredByMastery = true;
              return chain;
            },
            then(resolve: (value: unknown) => void) {
              resolve({
                count: chain.filteredByMastery ? belowThreshold : tracked,
                error: null,
              });
            },
          };
          return chain;
        },
      };
    },
  } as never;
}

describe("earned level promotion", () => {
  it("advances one step at a time and stops at the top", () => {
    expect(nextLearnerLevel("N5")).toBe("N4");
    expect(nextLearnerLevel("N4")).toBe("N3");
    expect(nextLearnerLevel("N2")).toBe("N1");
    expect(nextLearnerLevel("N1")).toBeNull();
    expect(LEVEL_SEQUENCE).toEqual(["N5", "N4", "N3", "N2", "N1"]);
  });

  it("promotes only when nothing is left below the learned threshold", async () => {
    const progress = await evaluateLevelProgress(
      masteryClient(168, 0),
      "user-1",
      "N5",
    );
    expect(progress?.eligible).toBe(true);
    expect(progress?.nextLevel).toBe("N4");
    expect(progress?.masteredItems).toBe(168);
    expect(progress?.remainingItems).toBe(0);
  });

  it("does not promote while any item is still unmastered", async () => {
    const progress = await evaluateLevelProgress(
      masteryClient(168, 1),
      "user-1",
      "N5",
    );
    expect(progress?.eligible).toBe(false);
    expect(progress?.masteredItems).toBe(167);
  });

  it("never promotes a learner who has nothing tracked yet", async () => {
    const progress = await evaluateLevelProgress(
      masteryClient(0, 0),
      "user-1",
      "N5",
    );
    expect(progress?.eligible).toBe(false);
  });

  it("cannot promote beyond the highest level", async () => {
    const progress = await evaluateLevelProgress(
      masteryClient(1325, 0),
      "user-1",
      "N1",
    );
    expect(progress?.nextLevel).toBeNull();
    expect(progress?.eligible).toBe(false);
  });
});

describe("revision lessons below the learner's level", () => {
  const candidates = [
    { value: "at-1", mastery: 100, requestedLevel: true, sourceOrder: 1, selectionSeed: "a" },
    { value: "at-2", mastery: 100, requestedLevel: true, sourceOrder: 2, selectionSeed: "b" },
    { value: "at-3", mastery: 100, requestedLevel: true, sourceOrder: 3, selectionSeed: "c" },
    { value: "other-level", mastery: 0, requestedLevel: false, sourceOrder: 4, selectionSeed: "d" },
  ];

  it("still selects fully mastered items, which the weakest-first rule cannot", () => {
    const picked = selectRandomLevelTargets(candidates, 2);
    expect(picked).toHaveLength(2);
    expect(picked.every((item) => item.startsWith("at-"))).toBe(true);
  });

  it("never selects items from another level", () => {
    const picked = selectRandomLevelTargets(candidates, 4);
    expect(picked).not.toContain("other-level");
    expect(picked).toHaveLength(3);
  });

  it("is deterministic for the same lesson seed", () => {
    expect(selectRandomLevelTargets(candidates, 2)).toEqual(
      selectRandomLevelTargets(candidates, 2),
    );
  });

  it("varies with the seed so repeated topics differ", () => {
    const reseeded = candidates.map((candidate) => ({
      ...candidate,
      selectionSeed: `${candidate.selectionSeed}:second-topic`,
    }));
    const first = selectRandomLevelTargets(candidates, 1);
    const second = selectRandomLevelTargets(reseeded, 1);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
  });
});
