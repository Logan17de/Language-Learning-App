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
  admin: new Set(["learn", "manage_content", "publish_lessons", "manage_users", "manage_subscriptions", "manage_support", "view_costs", "write_audit"]),
  content_editor: new Set(["learn", "manage_content", "publish_lessons"]),
  support: new Set(["learn", "manage_support"]),
};

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return permissions[role].has(permission);
}

export function canAccessAdmin(role: AppRole): boolean {
  return role === "admin" || role === "content_editor" || role === "support";
}

export function canAccessAdminPath(role: AppRole, pathname: string): boolean {
  if (!canAccessAdmin(role)) return false;
  if (pathname.startsWith("/admin/subscriptions") || pathname.startsWith("/admin/users")) return hasPermission(role, "manage_users") || hasPermission(role, "manage_subscriptions");
  if (pathname.startsWith("/admin/costs")) return hasPermission(role, "view_costs");
  if (pathname.startsWith("/admin/support") || pathname.startsWith("/admin/reports")) return hasPermission(role, "manage_support");
  if (pathname === "/admin" || pathname.startsWith("/admin/analytics") || pathname.startsWith("/admin/audit-log")) return role === "admin";
  return hasPermission(role, "manage_content");
}
