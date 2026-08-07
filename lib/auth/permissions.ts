export type AppRole = "learner" | "admin" | "content_editor" | "support";

export type Permission =
  | "learn"
  | "manage_content"
  | "publish_lessons"
  | "manage_users"
  | "manage_subscriptions"
  | "manage_support"
  | "view_costs"
  | "write_audit";

const permissions: Record<AppRole, ReadonlySet<Permission>> = {
  learner: new Set(["learn"]),
  admin: new Set([
    "learn",
    "manage_content",
    "publish_lessons",
    "manage_users",
    "manage_subscriptions",
    "manage_support",
    "view_costs",
    "write_audit",
  ]),
  // Production operations are intentionally owner-only. These legacy role
  // values remain in the schema for compatibility, but they have no staff
  // permissions in the application.
  content_editor: new Set(["learn"]),
  support: new Set(["learn"]),
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return permissions[role].has(permission);
}

export function canAccessAdmin(role: AppRole): boolean {
  return role === "admin";
}

export function canAccessAdminPath(role: AppRole, pathname: string): boolean {
  if (!canAccessAdmin(role)) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
