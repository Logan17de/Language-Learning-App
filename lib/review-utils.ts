import type { ReviewActivity, ReviewSession } from "@/types/review-session";
import type { ReviewQueueItem } from "@/types/progress";

function choices(correct: string, candidates: Array<string | undefined>): string[] {
  const result = [correct, ...candidates.filter((item): item is string => Boolean(item))]
    .filter((item, index) => item !== correct || index === 0)
    .filter((item, index, all) => all.indexOf(item) === index);
  while (result.length < 4) {
    result.push(`None of these ${result.length}`);
  }
  return result.slice(0, 4);
}

export function buildReviewActivities(
  queue: ReviewQueueItem[],
  limit = 7,
): ReviewActivity[] {
  const weakItems = queue
    .filter((item) => item.confidence < 85)
    .sort(
      (left, right) =>
        Number(Boolean(right.overdue)) - Number(Boolean(left.overdue)) ||
        left.confidence - right.confidence,
    )
    .slice(0, Math.max(0, limit));
  return weakItems.map((item, index) =>
    activityFor(item, index, weakItems),
  );
}

export function createReviewSession(
  queue: ReviewQueueItem[],
  sequence: number,
): ReviewSession {
  return {
    id: `review_session_${String(sequence).padStart(3, "0")}`,
    activities: buildReviewActivities(queue),
    currentIndex: 0,
    answers: [],
    startedAt: new Date().toISOString(),
    result: null,
    completed: false,
    rewarded: false,
  };
}

function activityFor(
  item: ReviewQueueItem,
  index: number,
  queue: ReviewQueueItem[],
): ReviewActivity {
  if (item.type === "grammar") {
    const correct = item.meaning ?? item.term;
    return {
      id: `review_${item.id}_${index}`,
      queueItemId: item.id,
      type: "grammar-mcq",
      prompt: "What does this grammar pattern express?",
      cue: item.term,
      choices: choices(
        correct,
        queue
          .filter((candidate) => candidate.type === "grammar")
          .map((candidate) => candidate.meaning),
      ),
      correctAnswer: correct,
      explanation: `${item.term} means ${correct}.`,
    };
  }

  const askForReading =
    item.type === "kanji" ||
    (item.type === "vocabulary" && index % 2 === 0 && Boolean(item.reading));
  if (askForReading && item.reading) {
    return {
      id: `review_${item.id}_${index}`,
      queueItemId: item.id,
      type: "kanji-reading",
      prompt: "Choose the correct reading.",
      cue: item.term,
      choices: choices(
        item.reading,
        queue.map((candidate) => candidate.reading),
      ),
      correctAnswer: item.reading,
      explanation: `${item.term} is read ${item.reading}.`,
    };
  }

  const correct = item.meaning ?? item.term;
  return {
    id: `review_${item.id}_${index}`,
    queueItemId: item.id,
    type: "reading-meaning",
    prompt: "Choose the closest meaning.",
    cue: item.reading ?? item.term,
    choices: choices(
      correct,
      queue.map((candidate) => candidate.meaning),
    ),
    correctAnswer: correct,
    explanation: `${item.term}${item.reading ? `（${item.reading}）` : ""} means ${correct}.`,
  };
}
