import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export async function hasPremiumLessonPhaseAccess(
  userId: string,
): Promise<boolean> {
  const admin = createAdminClient() as unknown as SupabaseClient;
  const { data, error } = await admin
    .from("profiles")
    .select("subscription_plan,role,status")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || data.status !== "active") return false;
  return (
    data.subscription_plan !== "free" ||
    data.role === "admin" ||
    data.role === "content_editor"
  );
}
