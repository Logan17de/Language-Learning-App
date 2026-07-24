import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Permission, type AppRole } from "@/lib/auth/permissions";

export type ServerAuthorization =
  | { ok: true; userId: string; role: AppRole }
  | { ok: false; status: 401 | 403; message: string };

export async function authorize(permission?: Permission): Promise<ServerAuthorization> {
  const client = await createClient();
  if (!client) return { ok: false, status: 401, message: "Backend is not configured." };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { ok: false, status: 401, message: "Authentication required." };
  const profile = await client.from("profiles").select("role,status").eq("id", data.user.id).single();
  if (profile.error || profile.data.status !== "active") return { ok: false, status: 403, message: "Account is not active." };
  if (permission && !hasPermission(profile.data.role, permission)) return { ok: false, status: 403, message: "Permission denied." };
  return { ok: true, userId: data.user.id, role: profile.data.role };
}
