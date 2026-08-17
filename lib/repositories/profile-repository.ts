import { createClient } from "@/lib/supabase/client";
import {
  failure,
  notConfigured,
  success,
  type RepositoryResult,
} from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";
import type { DailyMinutes, LearnerLevel, LearningGoal } from "@/types/learner";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

interface OnboardingUpdate {
  displayName: string;
  goal: LearningGoal | null;
  level: LearnerLevel | null;
  dailyMinutes: DailyMinutes | null;
}

function toDatabaseLevel(
  level: LearnerLevel,
): Database["public"]["Enums"]["jlpt_level"] {
  return level === "Beginner" || level === "Not sure" ? "N5" : level;
}

export const profileRepository = {
  async getCurrent(): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return failure(
        { code: "AUTH", message: "No session" },
        "Your session has expired. Please sign in again.",
      );
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .single();
    return error
      ? failure(error, "Your profile could not be loaded.")
      : success(data);
  },

  async updateCurrent(
    values: ProfileUpdate,
  ): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return failure(
        { code: "AUTH" },
        "Your session has expired. Please sign in again.",
      );
    const safeValues: ProfileUpdate = {
      display_name: values.display_name,
      current_jlpt_level: values.current_jlpt_level,
      learning_goal: values.learning_goal,
      daily_study_minutes: values.daily_study_minutes,
      timezone: values.timezone,
    };
    const { data, error } = await client
      .from("profiles")
      .update(safeValues)
      .eq("id", auth.user.id)
      .select("*")
      .single();
    if (error) return failure(error, "Your profile could not be updated.");

    const preferences = await client
      .from("user_preferences")
      .update({
        learning_goal: values.learning_goal,
        daily_study_minutes: values.daily_study_minutes,
        onboarding_complete: true,
      })
      .eq("user_id", auth.user.id);
    return preferences.error
      ? failure(
          preferences.error,
          "Your learning preferences could not be updated.",
        )
      : success(data);
  },

  async saveOnboarding(
    values: OnboardingUpdate,
  ): Promise<RepositoryResult<null>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return failure(
        { code: "AUTH" },
        "Your session has expired. Please sign in again.",
      );

    const profileValues: ProfileUpdate = {
      display_name: values.displayName.trim(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(values.goal ? { learning_goal: values.goal } : {}),
      ...(values.level
        ? { current_jlpt_level: toDatabaseLevel(values.level) }
        : {}),
      ...(values.dailyMinutes
        ? { daily_study_minutes: values.dailyMinutes }
        : {}),
    };
    const profile = await client
      .from("profiles")
      .update(profileValues)
      .eq("id", auth.user.id);
    if (profile.error)
      return failure(
        profile.error,
        "Your onboarding choices could not be saved.",
      );

    const preferenceValues: Database["public"]["Tables"]["user_preferences"]["Update"] =
      {
        onboarding_complete: true,
        ...(values.goal ? { learning_goal: values.goal } : {}),
        ...(values.dailyMinutes
          ? { daily_study_minutes: values.dailyMinutes }
          : {}),
      };
    const preferences = await client
      .from("user_preferences")
      .update(preferenceValues)
      .eq("user_id", auth.user.id);
    return preferences.error
      ? failure(preferences.error, "Your onboarding status could not be saved.")
      : success(null);
  },
};
