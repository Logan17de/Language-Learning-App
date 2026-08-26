import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const defaults = source("data/default-learner-state.ts");
const completePage = source("app/lesson/[lessonId]/complete/page.tsx");
const lessonStore = source("store/backend-lesson-store.ts");
const appStore = source("store/app-store.ts");
const settingsPage = source("components/settings/settings-page.tsx");
// Session hydration moved out of the component into the shared module.
const sessionHydrator = source("lib/auth/client-session.ts");
const authForm = source("components/auth/auth-form.tsx");
const lessonPlayer = source("components/lesson/lesson-player.tsx");
const lessonResult = source("components/lesson/lesson-result.tsx");

describe("authenticated learner state regressions", () => {
  it("uses neutral production defaults rather than demo learner data", () => {
    expect(defaults).toContain('name: "Learner"');
    expect(defaults).toContain('level: "N5"');
    expect(defaults).toContain("streakDays: 0");
    expect(defaults).toContain("xp: 0");
    expect(defaults).not.toContain("Hana");
  });

  it("loads the requested backend lesson for completion and deep links", () => {
    expect(completePage).toContain("loadBackendLesson(lessonId)");
    expect(lessonStore).toContain("lessonRepository.getPlayable(id)");
    expect(lessonStore).not.toContain("const result = await lessonRepository.assignNext();\n    if (!result.ok) return undefined;");
  });

  it("keeps XP, streak, and study totals server-owned in Supabase mode", () => {
    expect(appStore).toContain('const serverOwnsRewards = getBackendMode() === "supabase"');
    expect(appStore).toContain("user: serverOwnsRewards");
    expect(lessonResult).not.toContain("Math.max(streak, 13)");
    expect(lessonResult).toContain("progressRepository.loadCurrent()");
  });

  it("syncs daily-goal changes to the account but never the earned level", () => {
    expect(settingsPage).toContain("profileRepository.updateLearningPreferences");
    expect(settingsPage).toContain("dailyMinutes,");
    // JLPT level is awarded by claim_level_promotion() and the browser has no
    // write privilege on the column, so Settings must not try to set it.
    expect(settingsPage).not.toContain("{ level }");
  });

  it("rehydrates server-backed user settings after authentication", () => {
    expect(sessionHydrator).toContain("settingsRepository.loadCurrent()");
    expect(sessionHydrator).toContain("useAppStore.setState({ settings: settings.data })");
  });

  it("shows explicit email-confirmation feedback after signup", () => {
    expect(authForm).toContain('params.get("confirmation") === "required"');
    expect(authForm).toContain("Account created. Check your email and confirm your address");
  });

  it("does not count hidden-tab time as lesson study time", () => {
    expect(lessonPlayer).toContain('document.visibilityState !== "visible"');
    expect(lessonPlayer).toContain("setElapsedSeconds((value) => value + 1)");
  });
});
