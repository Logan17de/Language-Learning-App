import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effectiveStreakDays } from "@/lib/repositories/progress-repository";
import {
  calculateLessonXp,
  LESSON_COMPLETION_BASE_XP,
  LESSON_MAX_XP,
} from "@/lib/xp";

const home = readFileSync("components/home/home-dashboard.tsx", "utf8");
const authShell = readFileSync("components/auth/auth-shell.tsx", "utf8");
const resultPage = readFileSync("components/lesson/lesson-result.tsx", "utf8");
const sessionRepository = readFileSync(
  "lib/repositories/lesson-session-repository.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260818070053_xp_streak_completion_engine.sql",
  "utf8",
);

describe("language-neutral learner home", () => {
  it("does not bring study-time or Japanese-only dashboard concepts back", () => {
    expect(home).not.toContain("Daily study goal");
    expect(home).not.toContain("minutesStudiedToday");
    expect(home).not.toContain("dailyGoalMinutes");
    expect(home).not.toContain("おはよう");
    expect(home).not.toContain("Review");
    expect(home).not.toContain("review queue");
    expect(home.toLowerCase()).not.toContain("kanji");
    expect(home).not.toContain("user.level");

    expect(home).toContain("Welcome back");
    expect(home).toContain("make the language stick");
    expect(home).toContain("total XP");
    expect(home).toContain("day streak");
  });

  it("keeps global auth positioning language-neutral and review-free", () => {
    expect(authShell).toContain("Language that stays with you");
    expect(authShell).toContain("Adaptive practice");
    expect(authShell).not.toContain("Japanese that stays with you");
    expect(authShell).not.toContain("Personal review");
  });
});

describe("lesson XP engine", () => {
  it("awards 50 completion XP plus the clamped lesson score", () => {
    expect(LESSON_COMPLETION_BASE_XP).toBe(50);
    expect(LESSON_MAX_XP).toBe(150);
    expect(calculateLessonXp(0)).toBe(50);
    expect(calculateLessonXp(50)).toBe(100);
    expect(calculateLessonXp(100)).toBe(150);
    expect(calculateLessonXp(-20)).toBe(50);
    expect(calculateLessonXp(900)).toBe(150);
  });

  it("makes the database authoritative for XP and removes Review-era completion scoring", () => {
    expect(sessionRepository).toContain("p_xp: 0");
    expect(migration).toContain("v_xp := public.calculate_lesson_xp(p_score)");
    expect(migration).toContain("p_xp remains in the function signature only");
    expect(migration).not.toContain("xp = xp + p_xp");
    expect(migration).not.toContain("v_review_correct");
    expect(migration).not.toContain("v_review_total");
    expect(migration).not.toContain("review_correct");
    expect(migration).not.toContain("review_total");
  });
});

describe("streak engine", () => {
  it("expires a stored streak when the learner skipped a full local day", () => {
    expect(effectiveStreakDays(7, "2026-08-18", "2026-08-18")).toBe(7);
    expect(effectiveStreakDays(7, "2026-08-17", "2026-08-18")).toBe(7);
    expect(effectiveStreakDays(7, "2026-08-16", "2026-08-18")).toBe(0);
    expect(effectiveStreakDays(7, null, "2026-08-18")).toBe(0);
  });

  it("uses learner-local activity dates and never fabricates a result-page streak", () => {
    expect(migration).toContain("now() at time zone v_timezone");
    expect(migration).toContain("v_last_activity_date = v_today - 1");
    expect(migration).toContain("activity_date");
    expect(resultPage).not.toContain("Math.max(streak, 13)");
  });
});
