import type { Json } from "@/types/database";
import type { LegacyImportPreview } from "@/lib/migrations/migration-types";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function date(value: unknown): string {
  const parsed = text(value);
  return parsed && !Number.isNaN(Date.parse(parsed)) ? parsed : new Date().toISOString();
}

function masteryItems(state: UnknownRecord): Json[] {
  const progress = record(state.progress) ?? {};
  const groups: Array<[string, unknown]> = [
    ["kanji", progress.weakKanji],
    ["vocabulary", progress.weakVocabulary],
    ["grammar", progress.grammarToReview],
  ];
  return groups.flatMap(([itemType, values]) => array(values).flatMap((value) => {
    const item = record(value);
    const key = item ? text(item.term) : null;
    if (!item || !key) return [];
    return [{
      item_type: itemType,
      item_key: key,
      mastery: Math.max(0, Math.min(100, number(item.mastery))),
      confidence: Math.max(0, Math.min(100, number(item.mastery))),
    }];
  }));
}

export function parseLegacyState(raw: string): LegacyImportPreview | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const envelope = record(parsed);
  const state = record(envelope?.state);
  if (!state) return null;
  const progress = record(state.progress) ?? {};
  let skipped = 0;

  const completedLessons = array(progress.recentLessons).flatMap((value) => {
    const item = record(value);
    const lessonId = item ? text(item.lessonId) : null;
    if (!item || !lessonId) {
      skipped += 1;
      return [];
    }
    const completedAt = date(item.completedAt);
    return [{
      lesson_id: lessonId,
      score: Math.max(0, Math.min(100, number(item.score))),
      duration_minutes: Math.max(0, Math.round(number(item.durationMinutes))),
      completed_at: completedAt,
      legacy_key: `${lessonId}:${completedAt}`,
    }];
  });

  const queue = array(progress.reviewQueue).flatMap((value) => {
    const item = record(value);
    const key = item ? text(item.term) : null;
    const itemType = item ? text(item.type) : null;
    if (!item || !key || !itemType || !["kanji", "vocabulary", "grammar", "listening", "speaking"].includes(itemType)) {
      skipped += 1;
      return [];
    }
    return [{
      item_type: itemType,
      item_key: key,
      confidence: Math.max(0, Math.min(100, number(item.confidence))),
      reason: text(item.reason) ?? "Imported from this device",
      due_at: new Date().toISOString(),
      prompt_data: {
        term: key,
        reading: text(item.reading),
        meaning: text(item.meaning),
      },
    }];
  });

  const achievements = array(progress.achievements).flatMap((value) => {
    const item = record(value);
    const key = item ? text(item.id) : null;
    if (!item || !key) {
      skipped += 1;
      return [];
    }
    return [{
      key,
      progress: Math.max(0, Math.round(number(item.progress))),
      earned: item.earned === true,
      earned_at: item.earned === true ? date(item.earnedAt) : null,
    }];
  });

  const onboarding = record(state.onboarding) ?? {};
  const settings = record(state.settings) ?? {};
  const generated = array(state.generatedLessons).filter((value) => {
    const lesson = record(value);
    return lesson && text(lesson.id) && text(lesson.title) && Array.isArray(lesson.phases);
  });
  const mastery = masteryItems(state);
  const payload: Json = {
    preferences: {
      learning_goal: text(onboarding.goal),
      daily_study_minutes: number(onboarding.dailyMinutes, 30),
      interests: array(onboarding.interests).filter((value): value is string => typeof value === "string"),
      onboarding_complete: onboarding.completed === true,
    },
    settings: settings as Json,
    completed_lessons: completedLessons,
    mastery,
    review_queue: queue,
    achievements,
    generated_custom_lessons: generated as Json[],
  };

  return {
    payload,
    summary: {
      completedLessons: completedLessons.length,
      masteryItems: mastery.length,
      reviewItems: queue.length,
      achievements: achievements.length,
      customLessons: generated.length,
      skippedRecords: skipped,
    },
  };
}
