import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type {
  LessonFocus,
  ThemePreference,
  UserSettings,
} from "@/types/app-preferences";
import type { Json } from "@/types/database";

const DEFAULT_SETTINGS: UserSettings = {
  lessonLength: 30,
  preferredFocus: "balanced",
  readingDifficulty: "balanced",
  speakingDifficulty: "medium",
  theme: "light",
};

function asJson(settings: UserSettings): Json {
  return {
    lessonLength: settings.lessonLength,
    preferredFocus: settings.preferredFocus,
    readingDifficulty: settings.readingDifficulty,
    speakingDifficulty: settings.speakingDifficulty,
    theme: settings.theme,
  };
}

function normalizeSettings(value: unknown): UserSettings {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const lessonLength = [15, 30, 45, 60].includes(Number(source.lessonLength))
    ? (Number(source.lessonLength) as UserSettings["lessonLength"])
    : DEFAULT_SETTINGS.lessonLength;
  const focuses: LessonFocus[] = [
    "balanced",
    "conversation",
    "vocabulary",
    "grammar",
    "reading",
    "speaking",
    "workplace Japanese",
  ];
  const preferredFocus =
    typeof source.preferredFocus === "string" &&
    focuses.includes(source.preferredFocus as LessonFocus)
      ? (source.preferredFocus as LessonFocus)
      : DEFAULT_SETTINGS.preferredFocus;
  const readingDifficulties: UserSettings["readingDifficulty"][] = [
    "guided",
    "balanced",
    "independent",
  ];
  const readingDifficulty =
    typeof source.readingDifficulty === "string" &&
    readingDifficulties.includes(
      source.readingDifficulty as UserSettings["readingDifficulty"],
    )
      ? (source.readingDifficulty as UserSettings["readingDifficulty"])
      : DEFAULT_SETTINGS.readingDifficulty;
  const speakingDifficulties: UserSettings["speakingDifficulty"][] = [
    "easy",
    "medium",
    "hard",
  ];
  const speakingDifficulty =
    typeof source.speakingDifficulty === "string" &&
    speakingDifficulties.includes(
      source.speakingDifficulty as UserSettings["speakingDifficulty"],
    )
      ? (source.speakingDifficulty as UserSettings["speakingDifficulty"])
      : DEFAULT_SETTINGS.speakingDifficulty;
  const themes: ThemePreference[] = ["light", "dark", "system"];
  const theme =
    typeof source.theme === "string" &&
    themes.includes(source.theme as ThemePreference)
      ? (source.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme;

  return {
    lessonLength,
    preferredFocus,
    readingDifficulty,
    speakingDifficulty,
    theme,
  };
}

export const settingsRepository = {
  async loadCurrent(): Promise<RepositoryResult<UserSettings>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      return failure({ code: "AUTH" }, "Your session has expired.");
    }
    const { data, error } = await client
      .from("user_settings")
      .select("settings")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) return failure(error, "Settings could not be loaded.");
    return success(normalizeSettings(data?.settings));
  },

  async save(settings: UserSettings): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const { error } = await client.from("user_settings").upsert(
      { user_id: auth.user.id, settings: asJson(settings) },
      { onConflict: "user_id" },
    );
    return error ? failure(error, "Settings could not be synced.") : success(null);
  },
};
