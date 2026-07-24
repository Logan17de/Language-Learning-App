import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database, ProfileRow } from "@/types/database";

export const adminUserRepository = {
  async list(): Promise<RepositoryResult<ProfileRow[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("profiles").select("*").order("created_at", { ascending: false });
    return error ? failure(error, "Users could not be loaded.") : success(data ?? []);
  },

  async setStatus(userId: string, status: Database["public"]["Enums"]["account_status"]): Promise<RepositoryResult<ProfileRow>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("profiles").update({ status }).eq("id", userId).select("*").single();
    return error ? failure(error, "The account status could not be updated.") : success(data);
  },
};
