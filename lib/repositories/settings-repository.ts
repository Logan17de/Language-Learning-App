import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { UserSettings } from "@/types/app-preferences";
import type { Json } from "@/types/database";

function asJson(settings: UserSettings): Json {
  return {
    lessonLength: settings.lessonLength,
    preferredFocus: settings.preferredFocus,
    readingDifficulty: settings.readingDifficulty,
    speakingDifficulty: settings.speakingDifficulty,
    theme: settings.theme,
  };
}

export const settingsRepository = {
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
