import { describe, expect, it } from "vitest";
import { completionKey, dedupeByKey } from "@/lib/idempotency";

describe("idempotency helpers", () => {
  it("deduplicates completion attempts without changing the first result", () => {
    const items = [{ id: "a", value: 1 }, { id: "a", value: 2 }, { id: "b", value: 3 }];
    expect(dedupeByKey(items, (item) => item.id)).toEqual([items[0], items[2]]);
    expect(completionKey("lesson", "2026-07-24T00:00:00Z")).toBe("lesson:2026-07-24T00:00:00.000Z");
  });
});
