import type { ReviewQueueItem } from "@/types/progress";

export function rescheduleReviewItem(item: ReviewQueueItem, correct: boolean): ReviewQueueItem {
  if (!correct) {
    return {
      ...item,
      confidence: Math.max(20, item.confidence - 4),
      dueLabel: "Today",
      reason: "Missed in quick review",
      overdue: false,
      lastReviewed: "Just now",
    };
  }
  return {
    ...item,
    confidence: Math.min(100, item.confidence + 12),
    dueLabel: "In 3 days",
    lastReviewed: "Just now",
    overdue: false,
  };
}
