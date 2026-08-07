import { describe, expect, it } from "vitest";
import {
  canAccessAdmin,
  canAccessAdminPath,
  hasPermission,
} from "@/lib/auth/permissions";

describe("role permissions", () => {
  it("keeps production administration exclusive to admin", () => {
    expect(hasPermission("learner", "manage_content")).toBe(false);

    expect(canAccessAdmin("content_editor")).toBe(false);
    expect(hasPermission("content_editor", "manage_content")).toBe(false);
    expect(canAccessAdminPath("content_editor", "/admin/lessons")).toBe(false);

    expect(canAccessAdmin("support")).toBe(false);
    expect(hasPermission("support", "manage_support")).toBe(false);
    expect(canAccessAdminPath("support", "/admin/support")).toBe(false);

    expect(canAccessAdmin("admin")).toBe(true);
    expect(canAccessAdminPath("admin", "/admin")).toBe(true);
    expect(canAccessAdminPath("admin", "/admin/costs")).toBe(true);
    expect(hasPermission("admin", "manage_content")).toBe(true);
    expect(hasPermission("admin", "manage_users")).toBe(true);
  });
});
