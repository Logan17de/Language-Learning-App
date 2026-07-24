import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Achievement, MasteryItem, RecentLesson, ReviewQueueItem, WeeklyActivity } from "@/types/progress";

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
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && key in value && typeof value[key as keyof typeof value] === "string"
    ? value[key as keyof typeof value] as string
    : undefined;
}

export const progressRepository = {
  async loadCurrent(): Promise<RepositoryResult<BackendProgressSnapshot>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const userId = auth.user.id;
    const [profile, weekly, mastery, completions, queue, earned, definitions, lessons] = await Promise.all([
      client.from("profiles").select("xp,streak_days,longest_streak,total_study_minutes,daily_study_minutes").eq("id", userId).single(),
      client.from("weekly_activity").select("*").eq("user_id", userId).order("activity_date", { ascending: false }).limit(7),
      client.from("learner_mastery").select("*").eq("user_id", userId).lt("mastery", 70).order("mastery"),
      client.from("lesson_completions").select("*").eq("user_id", userId).order("completed_at", { ascending: false }).limit(20),
      client.from("review_queue").select("*").eq("user_id", userId).in("status", ["due", "scheduled"]).order("due_at"),
      client.from("user_achievements").select("*").eq("user_id", userId),
      client.from("achievements").select("*").eq("active", true),
      client.from("lessons").select("id,legacy_id,title"),
    ]);
    const firstError = [profile, weekly, mastery, completions, queue, earned, definitions, lessons].find((result) => result.error)?.error;
    if (firstError || !profile.data) return failure(firstError, "Your progress could not be loaded.");
    const lessonMap = new Map((lessons.data ?? []).map((lesson) => [lesson.id, lesson]));
    const masteryFor = (type: string): MasteryItem[] => (mastery.data ?? []).filter((item) => item.item_type === type).map((item) => ({
      term: item.item_key,
      meaning: item.item_key,
      mastery: item.mastery,
    }));
    const earnedMap = new Map((earned.data ?? []).map((item) => [item.achievement_id, item]));
    return success({
      xp: profile.data.xp,
      streakDays: profile.data.streak_days,
      longestStreak: profile.data.longest_streak,
      totalStudyMinutes: profile.data.total_study_minutes,
      weeklyActivity: (weekly.data ?? []).slice().reverse().map((item) => ({
        day: new Date(`${item.activity_date}T00:00:00`).toLocaleDateString("en", { weekday: "short" }),
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
      completedLessonIds: (completions.data ?? []).map((completion) => lessonMap.get(completion.lesson_id)?.legacy_id ?? completion.lesson_id),
      reviewQueue: (queue.data ?? []).map((item) => ({
        id: item.id,
        type: item.item_type as ReviewQueueItem["type"],
        term: item.item_key,
        dueLabel: new Date(item.due_at) <= new Date() ? "Today" : "Scheduled",
        confidence: item.confidence,
        reading: promptText(item.prompt_data, "reading"),
        meaning: promptText(item.prompt_data, "meaning"),
        reason: item.reason,
        overdue: new Date(item.due_at) < new Date(),
      })),
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
