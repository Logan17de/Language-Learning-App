import { describe, expect, it } from "vitest";
import { canAccessAdminPath, hasPermission } from "@/lib/auth/permissions";

describe("role permissions", () => {
  it("separates learner, editor, support, and administrator access", () => {
    expect(hasPermission("learner", "manage_content")).toBe(false);
    expect(canAccessAdminPath("content_editor", "/admin/lessons")).toBe(true);
    expect(canAccessAdminPath("content_editor", "/admin/subscriptions")).toBe(false);
    expect(canAccessAdminPath("support", "/admin/support")).toBe(true);
    expect(canAccessAdminPath("support", "/admin/lessons")).toBe(false);
    expect(canAccessAdminPath("admin", "/admin/costs")).toBe(true);
  });
});
