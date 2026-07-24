import type { ReviewActivity, ReviewSession } from "@/types/review-session";
import type { ReviewQueueItem } from "@/types/progress";

export function buildReviewActivities(queue: ReviewQueueItem[], limit = 7): ReviewActivity[] {
  const seen = new Set(queue.map((item) => item.id));
  const source = [...queue, ...fallbackQueue.filter((item) => !seen.has(item.id))];
  const desired = Math.max(5, Math.min(limit, source.length));
  return source.slice(0, desired).map((item, index) => activityFor(item, index));
}

export function createReviewSession(queue: ReviewQueueItem[], sequence: number): ReviewSession {
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

function activityFor(item: ReviewQueueItem, index: number): ReviewActivity {
  if (item.type === "grammar") {
    return {
      id: `review_${item.id}_${index}`,
      queueItemId: item.id,
      type: index % 2 ? "grammar-production" : "grammar-mcq",
      prompt: "Choose the natural completion.",
      cue: `電車が遅れた＿＿、少し遅くなりました。`,
      choices: ["ので", "ながら", "ように", "でも"],
      correctAnswer: "ので",
      explanation: "〜ので gives a reason in a neutral, natural way.",
    };
  }
  if (item.type === "listening") {
    return {
      id: `review_${item.id}_${index}`,
      queueItemId: item.id,
      type: "listening",
      prompt: "In the simulated audio, where will they meet?",
      choices: ["At the ticket gate", "At home", "At the café", "At the office"],
      correctAnswer: "At the ticket gate",
      explanation: "改札で会います means “We will meet at the ticket gate.”",
    };
  }
  if (item.type === "speaking") {
    return {
      id: `review_${item.id}_${index}`,
      queueItemId: item.id,
      type: "speaking",
      prompt: "Choose the natural sentence to say aloud.",
      choices: ["音楽を聞きながら、歩きます。", "音楽ながらを歩きます。", "歩きます音楽をながら。", "ながら音楽歩きます。"],
      correctAnswer: "音楽を聞きながら、歩きます。",
      explanation: "The secondary action uses the verb stem + ながら before the main action.",
    };
  }
  const reading = item.reading ?? (item.term === "駅" ? "えき" : "かいさつ");
  return {
    id: `review_${item.id}_${index}`,
    queueItemId: item.id,
    type: index % 3 === 0 ? "kanji-reading" : index % 3 === 1 ? "reading-meaning" : "meaning-japanese",
    prompt: index % 3 === 0 ? "Choose the reading." : index % 3 === 1 ? "Choose the meaning." : "Choose the Japanese word.",
    cue: index % 3 === 2 ? item.meaning : index % 3 === 1 ? reading : item.term,
    choices: index % 3 === 0
      ? [reading, "かいしゃ", "いっしょに", "はたらく"]
      : index % 3 === 1
        ? [item.meaning ?? "station", "company", "together", "to work"]
        : [item.term, "会社", "一緒に", "働く"],
    correctAnswer: index % 3 === 0 ? reading : index % 3 === 1 ? item.meaning ?? "station" : item.term,
    explanation: `${item.term}${reading ? `（${reading}）` : ""} means ${item.meaning ?? "this review item"}.`,
  };
}

const fallbackQueue: ReviewQueueItem[] = [
  { id: "fallback_kaisatsu", type: "kanji", term: "改札", reading: "かいさつ", meaning: "ticket gate", dueLabel: "Today", confidence: 45 },
  { id: "fallback_eki", type: "vocabulary", term: "駅", reading: "えき", meaning: "station", dueLabel: "Today", confidence: 60 },
  { id: "fallback_node", type: "grammar", term: "〜ので", meaning: "because", dueLabel: "Today", confidence: 58 },
  { id: "fallback_listen", type: "listening", term: "改札で会います", dueLabel: "Today", confidence: 52 },
  { id: "fallback_speak", type: "speaking", term: "〜ながら", dueLabel: "Today", confidence: 55 },
];
