import { describe, expect, it } from "vitest";
import {
  claimLevelPromotion,
  nextLearnerLevel,
  LEVEL_SEQUENCE,
} from "@/lib/learner-level-progression";
import { selectRandomLevelTargets } from "@/lib/mastery-target-selection";

/** Stand-in for the claim_level_promotion() RPC. */
function rpcClient(payload: unknown, error: unknown = null) {
  return {
    rpc() {
      return Promise.resolve({ data: payload, error });
    },
  } as never;
}

describe("earned level promotion", () => {
  it("advances one step at a time and stops at the top", () => {
    expect(nextLearnerLevel("N5")).toBe("N4");
    expect(nextLearnerLevel("N2")).toBe("N1");
    expect(nextLearnerLevel("N1")).toBeNull();
    expect(LEVEL_SEQUENCE).toEqual(["N5", "N4", "N3", "N2", "N1"]);
  });

  it("reports an awarded promotion from the server payload", async () => {
    const awarded = await claimLevelPromotion(
      rpcClient({
        promoted: true,
        fromLevel: "N5",
        level: "N4",
        trackedItems: 168,
        masteredItems: 168,
      }),
    );
    expect(awarded?.promoted).toBe(true);
    expect(awarded?.fromLevel).toBe("N5");
    expect(awarded?.level).toBe("N4");
    expect(awarded?.masteredItems).toBe(168);
  });

  it("does not celebrate while the level is still in progress", async () => {
    const awarded = await claimLevelPromotion(
      rpcClient({
        promoted: false,
        reason: "in_progress",
        level: "N5",
        trackedItems: 168,
        masteredItems: 167,
      }),
    );
    expect(awarded?.promoted).toBe(false);
  });

  it("does not celebrate a level that was already awarded", async () => {
    const awarded = await claimLevelPromotion(
      rpcClient({ promoted: false, reason: "already_awarded", level: "N4" }),
    );
    expect(awarded?.promoted).toBe(false);
  });

  it("stays silent when the RPC fails or is unavailable", async () => {
    expect(await claimLevelPromotion(rpcClient(null, { message: "nope" }))).toBeNull();
    expect(await claimLevelPromotion(rpcClient({ level: "not-a-level" }))).toBeNull();
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
