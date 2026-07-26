import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type {
  Achievement,
  MasteryItem,
  RecentLesson,
  ReviewQueueItem,
  WeeklyActivity,
} from "@/types/progress";

export interface BackendProgressSnapshot {
  xp: number;
  streakDays: number;
  longestStreak: number;
  totalStudyMinutes: number;
  weeklyActivity: WeeklyActivity[];
  weakKanji: MasteryItem[];
  weakVocabulary: MasteryItem[];
  grammarToReview: MasteryItem[];
  recentLessons: RecentLesson[];
  completedLessonIds: string[];
  reviewQueue: ReviewQueueItem[];
  achievements: Achievement[];
}

function promptText(value: unknown, key: string): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    key in value &&
    typeof value[key as keyof typeof value] === "string"
    ? (value[key as keyof typeof value] as string)
    : undefined;
}

function promptFirst(value: unknown, key: string): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !(key in value)
  ) {
    return undefined;
  }
  const items = value[key as keyof typeof value];
  return Array.isArray(items) && typeof items[0] === "string"
    ? items[0]
    : undefined;
}

export const progressRepository = {
  async loadCurrent(): Promise<
    RepositoryResult<BackendProgressSnapshot>
  > {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      return failure({ code: "AUTH" }, "Your session has expired.");
    }
    const userId = auth.user.id;
    const [
      profile,
      weekly,
      mastery,
      completions,
      queue,
      earned,
      definitions,
      lessons,
    ] = await Promise.all([
      client
        .from("profiles")
        .select(
          "xp,streak_days,longest_streak,total_study_minutes,daily_study_minutes",
        )
        .eq("id", userId)
        .single(),
      client
        .from("weekly_activity")
        .select("*")
        .eq("user_id", userId)
        .order("activity_date", { ascending: false })
        .limit(7),
      client
        .from("learner_mastery")
        .select("*")
        .eq("user_id", userId)
        .in("item_type", ["kanji", "vocabulary", "grammar"])
        .lt("mastery", 70)
        .order("mastery"),
      client
        .from("lesson_completions")
        .select("*")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(20),
      client
        .from("review_queue")
        .select("*")
        .eq("user_id", userId)
        .in("status", ["due", "scheduled"])
        .order("due_at"),
      client.from("user_achievements").select("*").eq("user_id", userId),
      client.from("achievements").select("*").eq("active", true),
      client.from("lessons").select("id,legacy_id,title"),
    ]);
    const firstError = [
      profile,
      weekly,
      mastery,
      completions,
      queue,
      earned,
      definitions,
      lessons,
    ].find((result) => result.error)?.error;
    if (firstError || !profile.data) {
      return failure(firstError, "Your progress could not be loaded.");
    }

    const allKeys = [...(mastery.data ?? []), ...(queue.data ?? [])];
    const ids = (type: string) =>
      allKeys
        .filter((item) => item.item_type === type)
        .map((item) => item.item_key)
        .filter((item, index, items) => items.indexOf(item) === index);
    const kanjiIds = ids("kanji");
    const vocabularyIds = ids("vocabulary");
    const grammarIds = ids("grammar");
    const [kanji, vocabulary, grammar] = await Promise.all([
      kanjiIds.length
        ? client
            .from("kanji_records")
            .select("id,character,meanings,readings")
            .in("id", kanjiIds)
        : Promise.resolve({ data: [], error: null }),
      vocabularyIds.length
        ? client
            .from("vocabulary_records")
            .select("id,written_form,reading,meaning")
            .in("id", vocabularyIds)
        : Promise.resolve({ data: [], error: null }),
      grammarIds.length
        ? client
            .from("grammar_records")
            .select("id,pattern,meaning")
            .in("id", grammarIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const libraryError = [kanji, vocabulary, grammar].find(
      (result) => result.error,
    )?.error;
    if (libraryError) {
      return failure(libraryError, "Your progress items could not be loaded.");
    }

    const kanjiMap = new Map(
      (kanji.data ?? []).map((item) => [item.id, item]),
    );
    const vocabularyMap = new Map(
      (vocabulary.data ?? []).map((item) => [item.id, item]),
    );
    const grammarMap = new Map(
      (grammar.data ?? []).map((item) => [item.id, item]),
    );
    const masteryFor = (type: string): MasteryItem[] =>
      (mastery.data ?? [])
        .filter((item) => item.item_type === type)
        .map((item) => {
          if (type === "kanji") {
            const record = kanjiMap.get(item.item_key);
            return {
              term: record?.character ?? item.item_key,
              reading: record?.readings[0],
              meaning: record?.meanings[0] ?? "Kanji",
              mastery: item.mastery,
            };
          }
          if (type === "vocabulary") {
            const record = vocabularyMap.get(item.item_key);
            return {
              term: record?.written_form ?? item.item_key,
              reading: record?.reading,
              meaning: record?.meaning ?? "Vocabulary",
              mastery: item.mastery,
            };
          }
          const record = grammarMap.get(item.item_key);
          return {
            term: record?.pattern ?? item.item_key,
            meaning: record?.meaning ?? "Grammar",
            mastery: item.mastery,
          };
        });

    const lessonMap = new Map(
      (lessons.data ?? []).map((lesson) => [lesson.id, lesson]),
    );
    const earnedMap = new Map(
      (earned.data ?? []).map((item) => [item.achievement_id, item]),
    );
    return success({
      xp: profile.data.xp,
      streakDays: profile.data.streak_days,
      longestStreak: profile.data.longest_streak,
      totalStudyMinutes: profile.data.total_study_minutes,
      weeklyActivity: (weekly.data ?? [])
        .slice()
        .reverse()
        .map((item) => ({
          day: new Date(
            `${item.activity_date}T00:00:00`,
          ).toLocaleDateString("en", { weekday: "short" }),
          minutes: item.minutes,
          goal: profile.data.daily_study_minutes,
        })),
      weakKanji: masteryFor("kanji"),
      weakVocabulary: masteryFor("vocabulary"),
      grammarToReview: masteryFor("grammar"),
      recentLessons: (completions.data ?? []).map((completion) => {
        const lesson = lessonMap.get(completion.lesson_id);
        return {
          lessonId: lesson?.legacy_id ?? completion.lesson_id,
          title: lesson?.title ?? "Japanese lesson",
          completedAt: completion.completed_at,
          score: completion.score,
          durationMinutes: completion.duration_minutes,
        };
      }),
      completedLessonIds: (completions.data ?? []).map(
        (completion) =>
          lessonMap.get(completion.lesson_id)?.legacy_id ??
          completion.lesson_id,
      ),
      reviewQueue: (queue.data ?? []).map((item) => {
        const kanjiRecord = kanjiMap.get(item.item_key);
        const vocabularyRecord = vocabularyMap.get(item.item_key);
        const grammarRecord = grammarMap.get(item.item_key);
        const term =
          promptText(item.prompt_data, "term") ??
          promptText(item.prompt_data, "character") ??
          promptText(item.prompt_data, "pattern") ??
          kanjiRecord?.character ??
          vocabularyRecord?.written_form ??
          grammarRecord?.pattern ??
          item.item_key;
        const reading =
          promptText(item.prompt_data, "reading") ??
          promptFirst(item.prompt_data, "readings") ??
          kanjiRecord?.readings[0] ??
          vocabularyRecord?.reading;
        const meaning =
          promptText(item.prompt_data, "meaning") ??
          promptFirst(item.prompt_data, "meanings") ??
          kanjiRecord?.meanings[0] ??
          vocabularyRecord?.meaning ??
          grammarRecord?.meaning;
        return {
          id: item.id,
          type: item.item_type as ReviewQueueItem["type"],
          term,
          dueLabel:
            new Date(item.due_at) <= new Date() ? "Today" : "Scheduled",
          confidence: item.confidence,
          reading,
          meaning,
          reason: item.reason,
          overdue: new Date(item.due_at) < new Date(),
        };
      }),
      achievements: (definitions.data ?? []).map((definition) => {
        const item = earnedMap.get(definition.id);
        return {
          id: definition.key,
          title: definition.title,
          description: definition.description,
          earned: Boolean(item?.earned_at),
          earnedAt: item?.earned_at ?? undefined,
          progress: item?.progress ?? 0,
          target: definition.target,
        };
      }),
    });
  },
};

