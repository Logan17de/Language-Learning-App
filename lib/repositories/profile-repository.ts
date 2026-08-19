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

interface OnboardingCommit {
  displayName: string;
  goal: LearningGoal | null;
  level: LearnerLevel;
  dailyMinutes: DailyMinutes;
}

interface LearningPreferenceUpdate {
  level?: LearnerLevel;
  dailyMinutes?: DailyMinutes;
  goal?: LearningGoal | null;
}

interface UntypedRpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface UntypedRpcClient {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<UntypedRpcResult>;
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

  async updateLearningPreferences(
    values: LearningPreferenceUpdate,
  ): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      return failure(
        { code: "AUTH" },
        "Your session has expired. Please sign in again.",
      );
    }

    const profileValues: ProfileUpdate = {
      ...(values.level
        ? { current_jlpt_level: toDatabaseLevel(values.level) }
        : {}),
      ...(values.dailyMinutes
        ? { daily_study_minutes: values.dailyMinutes }
        : {}),
      ...(values.goal !== undefined ? { learning_goal: values.goal } : {}),
    };
    const { data, error } = await client
      .from("profiles")
      .update(profileValues)
      .eq("id", auth.user.id)
      .select("*")
      .single();
    if (error) {
      return failure(error, "Your learning preferences could not be updated.");
    }

    const preferenceValues: Database["public"]["Tables"]["user_preferences"]["Update"] = {
      ...(values.dailyMinutes
        ? { daily_study_minutes: values.dailyMinutes }
        : {}),
      ...(values.goal !== undefined ? { learning_goal: values.goal } : {}),
    };
    if (Object.keys(preferenceValues).length) {
      const preferences = await client
        .from("user_preferences")
        .update(preferenceValues)
        .eq("user_id", auth.user.id);
      if (preferences.error) {
        return failure(
          preferences.error,
          "Your learning preferences could not be updated.",
        );
      }
    }

    return success(data);
  },

  async saveOnboarding(
    values: OnboardingUpdate,
  ): Promise<RepositoryResult<OnboardingCommit>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user)
      return failure(
        { code: "AUTH" },
        "Your session has expired. Please sign in again.",
      );

    const displayName = values.displayName.trim() || "Learner";
    const goal = values.goal;
    const level = toDatabaseLevel(values.level ?? "N5");
    const dailyMinutes = values.dailyMinutes ?? 30;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    // Keep the generated Database type compatible with older deployed schemas
    // while this RPC is absent from the generated type. Cast the client rather
    // than extracting client.rpc: SupabaseClient.rpc uses `this.rest` internally.
    const rpcClient = client as unknown as UntypedRpcClient;
    const { error } = await rpcClient.rpc("complete_onboarding", {
      p_display_name: displayName,
      p_learning_goal: goal,
      p_level: level,
      p_daily_study_minutes: dailyMinutes,
      p_timezone: timezone,
    });

    if (error) {
      return failure(error, "Your onboarding choices could not be saved.");
    }

    return success({
      displayName,
      goal,
      level,
      dailyMinutes,
    });
  },
};
