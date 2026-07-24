import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync("supabase/migrations/20260724090000_initial_schema.sql", "utf8");
const rls = readFileSync("supabase/migrations/20260724090100_rls_policies.sql", "utf8");
const functions = readFileSync("supabase/migrations/20260724090200_functions_views_storage.sql", "utf8");
const legacyImport = readFileSync("supabase/migrations/20260724090300_legacy_import.sql", "utf8");
const authoring = readFileSync("supabase/migrations/20260724090400_draft_authoring.sql", "utf8");
const assignment = readFileSync("supabase/migrations/20260725090000_adaptive_lesson_assignment.sql", "utf8");

describe("Supabase integration contract", () => {
  it("pins sessions to a lesson version and makes rewards database-idempotent", () => {
    expect(schema).toContain("lesson_version_id uuid not null references public.lesson_versions");
    expect(schema).toContain("unique (reward_type, source_id)");
    expect(functions).toContain("for update");
    expect(functions).toContain("on conflict (reward_type, source_id) do nothing");
  });

  it("keeps unpublished lessons out of learner reads and role-gates publishing", () => {
    expect(rls).toContain("status = 'published' and archived_at is null");
    expect(functions).toContain("array['admin','content_editor']");
    expect(rls).not.toMatch(/to authenticated\s+using\s*\(\s*true\s*\)/i);
  });

  it("bootstraps profiles and prevents duplicate active sessions", () => {
    expect(schema).toContain("create trigger on_auth_user_created");
    expect(schema).toContain("insert into public.user_preferences");
    expect(schema).toContain("one_active_lesson_session_per_version");
    expect(schema).toContain("one_active_review_session_per_user");
  });

  it("protects reports and support while allowing owner submission", () => {
    expect(rls).toContain("reports_own_insert");
    expect(rls).toContain("tickets_own_insert");
    expect(rls).toContain("messages_visible_to_owner");
    expect(rls).toContain("array['admin','support']");
  });

  it("makes legacy import one-time and conflict-safe", () => {
    expect(legacyImport).toContain("legacy_imported_at is not null");
    expect(legacyImport).toContain("on conflict (user_id, item_type, item_key) do nothing");
    expect(legacyImport).toContain("update public.profiles set legacy_imported_at = now()");
  });

  it("keeps draft content normalized and publishes a cloned immutable version", () => {
    expect(authoring).toContain("function public.save_lesson_draft");
    expect(authoring).toContain("insert into public.lesson_story_lines");
    expect(authoring).toContain("insert into public.lesson_review_activities");
    expect(authoring).toContain("v_source.metadata");
    expect(authoring).toContain("current_version_id = v_new_id");
  });

  it("enforces level-based, non-repeating backend assignment", () => {
    expect(assignment).toContain("unique (user_id, lesson_id)");
    expect(assignment).toContain("l.jlpt_level = v_profile.current_jlpt_level");
    expect(assignment).toContain("v_profile.subscription_plan = 'free'");
    expect(assignment).toContain("lesson_sessions_requires_assignment");
    expect(assignment).toContain("as restrictive for insert");
  });

  it("keeps custom generation Pro-only, private, and database-backed", () => {
    expect(assignment).toContain("Pro subscription required");
    expect(assignment).toContain("generated_for_user_id = auth.uid()");
    expect(assignment).toContain("function public.store_generated_lesson_package");
    expect(assignment).toContain("'pro_custom'");
  });
});
