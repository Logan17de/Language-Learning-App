import { createClient } from "@/lib/supabase/client";
import { failure, notConfigured, success, type RepositoryResult } from "@/lib/repositories/result";
import type { Database } from "@/types/database";

type Mastery = Database["public"]["Tables"]["learner_mastery"]["Row"];

export const masteryRepository = {
  async list(): Promise<RepositoryResult<Mastery[]>> {
    const client = createClient();
    if (!client) return notConfigured();
    const { data, error } = await client.from("learner_mastery").select("*").order("mastery");
    return error ? failure(error, "Mastery data could not be loaded.") : success(data ?? []);
  },

  async merge(records: Database["public"]["Tables"]["learner_mastery"]["Insert"][]): Promise<RepositoryResult<number>> {
    const client = createClient();
    if (!client) return notConfigured();
    if (!records.length) return success(0);
    const { error } = await client.from("learner_mastery").upsert(records, { onConflict: "user_id,item_type,item_key", ignoreDuplicates: true });
    return error ? failure(error, "Some mastery data could not be imported.") : success(records.length);
  },
};
