import "server-only";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, type Permission, type AppRole } from "@/lib/auth/permissions";

export type ServerAuthorization =
  | { ok: true; userId: string; role: AppRole }
  | { ok: false; status: 401 | 403; message: string };

export async function authorize(permission?: Permission, request?: Request): Promise<ServerAuthorization> {
  const client = await createClient(request);
  if (!client) {
    return { ok: false, status: 401, message: "Backend is not configured." };
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return { ok: false, status: 401, message: "Authentication required." };
  }

  const [profile, effectiveRole] = await Promise.all([
    client
      .from("profiles")
      .select("status")
      .eq("id", data.user.id)
      .single(),
    client.rpc("current_app_role"),
  ]);

  if (profile.error || profile.data.status !== "active") {
    return { ok: false, status: 403, message: "Account is not active." };
  }
  if (effectiveRole.error || !effectiveRole.data) {
    return { ok: false, status: 403, message: "Permission denied." };
  }

  const role = effectiveRole.data;

  // Every operational permission is owner-admin only. Keep this explicit even
  // though the permission table currently says the same thing so a future role
  // expansion cannot silently reopen service-role routes.
  if (permission && permission !== "learn" && role !== "admin") {
    return { ok: false, status: 403, message: "Permission denied." };
  }
  if (permission && !hasPermission(role, permission)) {
    return { ok: false, status: 403, message: "Permission denied." };
  }

  return { ok: true, userId: data.user.id, role };
}
