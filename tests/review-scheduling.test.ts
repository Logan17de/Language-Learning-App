import { describe, expect, it } from "vitest";
import { rescheduleReviewItem } from "@/lib/review-scheduling";
import type { ReviewQueueItem } from "@/types/progress";

const item: ReviewQueueItem = { id: "one", type: "kanji", term: "駅", dueLabel: "Today", confidence: 50 };

describe("deterministic review scheduling", () => {
  it("keeps failed items due and spaces successful items", () => {
    expect(rescheduleReviewItem(item, false)).toMatchObject({ dueLabel: "Today", confidence: 46 });
    expect(rescheduleReviewItem(item, true)).toMatchObject({ dueLabel: "In 3 days", confidence: 62 });
  });
});
