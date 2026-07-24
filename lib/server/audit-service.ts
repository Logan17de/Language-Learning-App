import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export async function writeAudit(input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: Json | null;
  after?: Json | null;
  metadata?: Json;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_logs").insert({
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    before_summary: input.before ?? null,
    after_summary: input.after ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) throw error;
}
