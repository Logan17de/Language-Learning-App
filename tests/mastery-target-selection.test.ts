import { describe, expect, it } from "vitest";
import {
  LEARNED_MASTERY_THRESHOLD,
  LOW_MASTERY_POOL_SIZE,
  selectFromLowestMasteryPool,
} from "@/lib/mastery-target-selection";

describe("mastery target selection", () => {
  it("treats 80 mastery as learned and excludes learned targets", () => {
    const selected = selectFromLowestMasteryPool(
      [
        candidate("weak", 79, 1),
        candidate("learned", 80, 2),
        candidate("strong", 95, 3),
      ],
      3,
    );

    expect(LEARNED_MASTERY_THRESHOLD).toBe(80);
    expect(selected).toEqual(["weak"]);
  });

  it("chooses only from the ten lowest-mastery eligible targets", () => {
    const candidates = Array.from({ length: 15 }, (_, index) =>
      candidate(`item-${index}`, index, index),
    );
    const selected = selectFromLowestMasteryPool(candidates, 5);

    expect(LOW_MASTERY_POOL_SIZE).toBe(10);
    expect(selected).toHaveLength(5);
    expect(
      selected.every((value) => Number(value.replace("item-", "")) < 10),
    ).toBe(true);
  });

  it("supports choosing three grammar targets from the same low-ten rule", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      candidate(`grammar-${index}`, index * 5, index),
    );
    const selected = selectFromLowestMasteryPool(candidates, 3);

    expect(selected).toHaveLength(3);
    expect(
      selected.every((value) => Number(value.replace("grammar-", "")) < 10),
    ).toBe(true);
  });
});

function candidate(value: string, mastery: number, sourceOrder: number) {
  return {
    value,
    mastery,
    requestedLevel: true,
    sourceOrder,
    selectionSeed: `seed:${value}`,
  };
}
