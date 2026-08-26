import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type {
  DailyMinutes,
  LearnerLevel,
  LearningGoal,
} from "@/types/learner";
import type {
} from "@/types/progress";

export interface BackendProgressSnapshot {
  currentLevel: LearnerLevel;
  learningGoal: LearningGoal | null;
  dailyGoalMinutes: DailyMinutes;
  minutesStudiedToday: number;
  joinDate: string;
  levelCompletion: number;
  learnedVocabularyCount: number;
  learnedKanjiCount: number;
  learnedGrammarCount: number;
  completedLessonCount: number;
  xp: number;
  streakDays: number;
  completedLessonIds: string[];
}

function summaryNumber(value: unknown, key: string): number {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    key in value &&
    typeof value[key as keyof typeof value] === "number"
    ? (value[key as keyof typeof value] as number)
    : 0;
}

function dateInTimeZone(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function shiftIsoDate(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function effectiveStreakDays(
  storedStreak: number,
  latestActivityDate: string | null | undefined,
  today: string,
): number {
  if (!latestActivityDate) return 0;
  const yesterday = shiftIsoDate(today, -1);
  return latestActivityDate === today || latestActivityDate === yesterday
    ? Math.max(0, storedStreak)
    : 0;
}

function dailyMinutes(value: number): DailyMinutes {
  return value === 15 || value === 45 || value === 60 ? value : 30;
}

export interface MasteryBandRow {
  key: string;
  label: string;
  before: number;
  after: number;
}

export interface LessonMasteryProgress {
  level: string;
  hasBaseline: boolean;
  categories: MasteryBandRow[];
  overall: MasteryBandRow;
}

export interface LevelMastery {
  level: string;
  averageMastery: number;
  trackedItems: number;
  masteredItems: number;
}

export const progressRepository = {
  /**
   * Average mastery across the learner's level and every level below it — the
   * scope promotion is judged on.
   */
  /** What the lesson just finished moved, by category and overall. */
  async lessonMasteryProgress(): Promise<RepositoryResult<LessonMasteryProgress>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("lesson_mastery_progress");
    if (error) return failure(error, "Your mastery change could not be loaded.");
    const row = (data ?? {}) as Record<string, unknown>;
    const band = (value: unknown): MasteryBandRow | null => {
      if (!value || typeof value !== "object") return null;
      const item = value as Record<string, unknown>;
      if (typeof item.key !== "string" || typeof item.label !== "string") return null;
      return {
        key: item.key,
        label: item.label,
        before: Number(item.before ?? 0),
        after: Number(item.after ?? 0),
      };
    };
    const overall = band(row.overall);
    if (!overall) return failure({}, "Your mastery change could not be loaded.");
    return success({
      level: typeof row.level === "string" ? row.level : "",
      hasBaseline: row.hasBaseline === true,
      categories: (Array.isArray(row.categories) ? row.categories : [])
        .map(band)
        .filter((item): item is MasteryBandRow => item !== null),
      overall,
    });
  },

  async levelMastery(): Promise<RepositoryResult<LevelMastery>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.rpc("learner_level_mastery");
    if (error) return failure(error, "Your level progress could not be loaded.");
    const row = (data ?? {}) as Record<string, unknown>;
    return success({
      level: typeof row.level === "string" ? row.level : "",
      averageMastery: Number(row.averageMastery ?? 0),
      trackedItems: Number(row.trackedItems ?? 0),
      masteredItems: Number(row.masteredItems ?? 0),
    });
  },

  async loadCurrent(): Promise<RepositoryResult<BackendProgressSnapshot>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      return failure({ code: "AUTH" }, "Your session has expired.");
    }
    const userId = auth.user.id;
    const [
      profile,
      summary,
      weekly,
      completions,
      completionCount,
      lessons,
    ] = await Promise.all([
      client
        .from("profiles")
        .select(
          "xp,streak_days,daily_study_minutes,current_jlpt_level,learning_goal,created_at,timezone",
        )
        .eq("id", userId)
        .single(),
      client.rpc("get_learner_progress_summary"),
      client
        .from("weekly_activity")
        .select("*")
        .eq("user_id", userId)
        .order("activity_date", { ascending: false })
        .limit(7),
      client
        .from("lesson_completions")
        .select("lesson_id")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(20),
      client
        .from("lesson_completions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      client.from("lessons").select("id,legacy_id"),
    ]);
    const firstError = [
      profile,
      summary,
      weekly,
      completions,
      completionCount,
      lessons,
    ].find((result) => result.error)?.error;
    if (firstError || !profile.data) {
      return failure(firstError, "Your progress could not be loaded.");
    }

    const lessonMap = new Map(
      (lessons.data ?? []).map((lesson) => [lesson.id, lesson]),
    );
    const today = dateInTimeZone(profile.data.timezone);
    const latestActivityDate = (weekly.data ?? [])[0]?.activity_date;
    const minutesStudiedToday =
      (weekly.data ?? []).find((item) => item.activity_date === today)?.minutes ?? 0;
    const goalMinutes = dailyMinutes(profile.data.daily_study_minutes);

    return success({
      currentLevel: profile.data.current_jlpt_level as LearnerLevel,
      learningGoal: profile.data.learning_goal as LearningGoal | null,
      dailyGoalMinutes: goalMinutes,
      minutesStudiedToday,
      joinDate: profile.data.created_at.slice(0, 10),
      levelCompletion: summaryNumber(summary.data, "level_completion"),
      learnedVocabularyCount: summaryNumber(
        summary.data,
        "learned_vocabulary",
      ),
      learnedKanjiCount: summaryNumber(summary.data, "learned_kanji"),
      learnedGrammarCount: summaryNumber(summary.data, "learned_grammar"),
      completedLessonCount: completionCount.count ?? 0,
      xp: profile.data.xp,
      streakDays: effectiveStreakDays(
        profile.data.streak_days,
        latestActivityDate,
        today,
      ),
      completedLessonIds: (completions.data ?? []).map(
        (completion) =>
          lessonMap.get(completion.lesson_id)?.legacy_id ?? completion.lesson_id,
      ),
    });
  },
};
