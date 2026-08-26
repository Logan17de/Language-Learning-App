import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safePostOnboardingDestination } from "@/lib/auth/post-onboarding-destination";

const source = (path: string) => readFileSync(path, "utf8");

const middleware = source("lib/supabase/middleware.ts");
const onboarding = source("components/onboarding/onboarding-flow.tsx");
const draft = source("lib/onboarding/onboarding-draft.ts");
const profileRepository = source("lib/repositories/profile-repository.ts");
const migration = source(
  "supabase/migrations/20260818103656_onboarding_assignment_guards.sql",
);
const privilegeMigration = source(
  "supabase/migrations/20260818104032_restrict_onboarding_rpc_execution.sql",
);
const onboardingPage = source("app/onboarding/page.tsx");

describe("onboarding flow regressions", () => {
  it("forces incomplete learners through onboarding and completed learners out", () => {
    expect(middleware).toContain('.select("onboarding_complete")');
    expect(middleware).toContain(
      "!preferences.data.onboarding_complete && !isOnboarding",
    );
    expect(middleware).toContain('url.pathname = "/onboarding"');
    expect(middleware).toContain(
      "preferences.data.onboarding_complete && isOnboarding",
    );
    expect(middleware).toContain('next ?? "/home"');
  });

  it("rejects auth/setup routes as post-onboarding destinations", () => {
    expect(safePostOnboardingDestination("/learn")).toBe("/learn");
    expect(safePostOnboardingDestination("/subscription?from=signup")).toBe(
      "/subscription?from=signup",
    );
    expect(safePostOnboardingDestination("/home#today")).toBe("/home#today");
    expect(safePostOnboardingDestination("/onboarding")).toBeNull();
    expect(safePostOnboardingDestination("/onboarding?next=/learn")).toBeNull();
    expect(safePostOnboardingDestination("/login")).toBeNull();
    expect(safePostOnboardingDestination("/signup")).toBeNull();
    expect(safePostOnboardingDestination("/forgot-password")).toBeNull();
    expect(safePostOnboardingDestination("/reset-password")).toBeNull();
    expect(safePostOnboardingDestination("/auth/callback")).toBeNull();
    expect(safePostOnboardingDestination("/admin")).toBeNull();
  });

  it("commits onboarding atomically and makes it one-time", () => {
    expect(profileRepository).toContain('rpc("complete_onboarding"');
    expect(migration).toContain("create or replace function public.complete_onboarding(");
    expect(migration).toContain("if v_onboarding_complete then");
    expect(migration).toContain("update public.profiles");
    expect(migration).toContain("update public.user_preferences");
    expect(migration).toContain("onboarding_complete = true");
    expect(migration).toContain("Onboarding is already complete");
  });

  it("never assigns lessons before onboarding or reuses a stale level assignment", () => {
    expect(migration).toContain("Complete onboarding before lesson assignment");
    expect(migration).toContain("delete from public.lesson_assignments assignment");
    expect(migration).toContain("assignment.status = 'assigned'");
    expect(migration).toContain(
      "lesson.jlpt_level <> v_profile.current_jlpt_level",
    );
    expect(migration).toContain("l.jlpt_level = v_profile.current_jlpt_level");
    expect(migration).toContain("level-v5-onboarding-guard");
  });

  it("does not expose onboarding-owned security-definer RPCs to anonymous callers", () => {
    expect(privilegeMigration).toContain(
      "revoke execute on function public.assign_next_lesson() from anon",
    );
    expect(privilegeMigration).toContain(
      "revoke execute on function public.complete_onboarding(",
    );
    expect(privilegeMigration).toContain("from anon");
    expect(privilegeMigration).toContain("to authenticated");
  });

  it("keeps wizard edits in an account-scoped draft until completion", () => {
    expect(draft).toContain('const STORAGE_PREFIX = "aiko-onboarding-draft"');
    expect(draft).toContain("`${STORAGE_PREFIX}:${userId}`");
    expect(onboarding).toContain("readOnboardingDraft(user.id)");
    expect(onboarding).toContain("saveOnboardingDraft(user.id");
    expect(onboarding).toContain("clearOnboardingDraft(user.id)");
    expect(onboarding).not.toContain("acknowledgeReading");
    expect(onboarding).not.toContain("readingPermissionUnderstood");
    const saveIndex = onboarding.indexOf("await profileRepository.saveOnboarding");
    const commitIndex = onboarding.indexOf("setGoal(committed.goal)");
    expect(saveIndex).toBeGreaterThan(-1);
    expect(commitIndex).toBeGreaterThan(saveIndex);
  });

  it("offers N1 and describes the fallback starting point honestly", () => {
    expect(onboarding).toContain('value: "N1"');
    expect(onboarding).toContain('label: "Start me at the beginning"');
    expect(onboarding).toContain("We’ll begin at N5 and adapt from there");
    expect(onboarding).not.toContain("Help me find the right starting point");
    expect(onboarding).toContain(
      "we’ll start at N5 with a 30-minute daily target",
    );
  });

  it("uses accessible choices, dialog behavior, focus, and browser step history", () => {
    expect(onboarding).toContain('<fieldset>');
    expect(onboarding).toContain('type="radio"');
    expect(onboarding).toContain('aria-modal="true"');
    expect(onboarding).toContain('main?.setAttribute("inert", "")');
    expect(onboarding).toContain('event.key === "Escape"');
    expect(onboarding).toContain('event.key !== "Tab"');
    expect(onboarding).toContain("returnFocusRef.current?.focus()");
    expect(onboarding).toContain("headingRef.current?.focus()");
    expect(onboarding).toContain('window.addEventListener("popstate"');
    expect(onboarding).toContain('"pushState" : "replaceState"');
  });

  it("uses honest handoff copy and private onboarding metadata", () => {
    expect(onboarding).toContain("Go to my learning path");
    expect(onboarding).not.toContain("See my first lesson");
    expect(onboardingPage).toContain(
      "robots: { index: false, follow: false }",
    );
    expect(onboardingPage).toContain('canonical: "/onboarding"');
  });
});
