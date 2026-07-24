import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export const profileRepository = {
  async getCurrent(): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH", message: "No session" }, "Your session has expired. Please sign in again.");
    const { data, error } = await client.from("profiles").select("*").eq("id", auth.user.id).single();
    return error ? failure(error, "Your profile could not be loaded.") : success(data);
  },

  async updateCurrent(values: ProfileUpdate): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired. Please sign in again.");
    const safeValues: ProfileUpdate = {
      display_name: values.display_name,
      current_jlpt_level: values.current_jlpt_level,
      learning_goal: values.learning_goal,
      daily_study_minutes: values.daily_study_minutes,
      interests: values.interests,
      timezone: values.timezone,
    };
    const { data, error } = await client.from("profiles").update(safeValues).eq("id", auth.user.id).select("*").single();
    return error ? failure(error, "Your profile could not be updated.") : success(data);
  },

  async markLegacyImported(): Promise<RepositoryResult<string>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return failure({ code: "AUTH" }, "Your session has expired.");
    const importedAt = new Date().toISOString();
    const { error } = await client.from("profiles").update({ legacy_imported_at: importedAt }).eq("id", auth.user.id);
    return error ? failure(error, "The import marker could not be saved.") : success(importedAt);
  },
};
