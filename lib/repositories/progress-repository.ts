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
  Achievement,
  MasteryItem,
  RecentLesson,
  WeeklyActivity,
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
  longestStreak: number;
  totalStudyMinutes: number;
  weeklyActivity: WeeklyActivity[];
  weakKanji: MasteryItem[];
  weakVocabulary: MasteryItem[];
  grammarToReview: MasteryItem[];
  recentLessons: RecentLesson[];
  completedLessonIds: string[];
  achievements: Achievement[];
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
      mastery,
      completions,
      completionCount,
      earned,
      definitions,
      lessons,
    ] = await Promise.all([
      client
        .from("profiles")
        .select(
          "xp,streak_days,longest_streak,total_study_minutes,daily_study_minutes,current_jlpt_level,learning_goal,created_at,timezone",
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
        .from("lesson_completions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      client.from("user_achievements").select("*").eq("user_id", userId),
      client.from("achievements").select("*").eq("active", true),
      client.from("lessons").select("id,legacy_id,title"),
    ]);
    const firstError = [
      profile,
      summary,
      weekly,
      mastery,
      completions,
      completionCount,
      earned,
      definitions,
      lessons,
    ].find((result) => result.error)?.error;
    if (firstError || !profile.data) {
      return failure(firstError, "Your progress could not be loaded.");
    }

    const ids = (type: string) =>
      (mastery.data ?? [])
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
      longestStreak: profile.data.longest_streak,
      totalStudyMinutes: profile.data.total_study_minutes,
      weeklyActivity: (weekly.data ?? [])
        .slice()
        .reverse()
        .map((item) => ({
          day: new Date(`${item.activity_date}T00:00:00`).toLocaleDateString(
            "en",
            { weekday: "short" },
          ),
          minutes: item.minutes,
          goal: goalMinutes,
        })),
      weakKanji: masteryFor("kanji"),
      weakVocabulary: masteryFor("vocabulary"),
      grammarToReview: masteryFor("grammar"),
      recentLessons: (completions.data ?? []).map((completion) => {
        const lesson = lessonMap.get(completion.lesson_id);
        return {
          lessonId: lesson?.legacy_id ?? completion.lesson_id,
          title: lesson?.title ?? "Language lesson",
          completedAt: completion.completed_at,
          score: completion.score,
          durationMinutes: completion.duration_minutes,
        };
      }),
      completedLessonIds: (completions.data ?? []).map(
        (completion) =>
          lessonMap.get(completion.lesson_id)?.legacy_id ?? completion.lesson_id,
      ),
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
