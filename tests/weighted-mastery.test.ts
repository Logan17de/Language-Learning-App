import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260813110000_weighted_mastery_threshold.sql",
  ),
  "utf8",
);

const lessonPlan = readFileSync(
  resolve(process.cwd(), "lib/gemini/lesson-plan-v3.ts"),
  "utf8",
);

describe("weighted mastery contract", () => {
  it("weights meaning 40, recognition 40, pronunciation 20", () => {
    expect(migration).toContain("p_meaning, 0))) * 0.40");
    expect(migration).toContain("p_recognition, 0))) * 0.40");
    expect(migration).toContain("p_pronunciation, 0))) * 0.20");
  });

  it("marks mastery 80 and above as learned", () => {
    expect(migration).toContain("new.mastery >= 80");
    expect(migration).toContain("mastery.mastery >= 80");
    expect(lessonPlan).toContain("LEARNED_MASTERY_THRESHOLD");
    expect(lessonPlan).not.toContain("learner_kanji_exposure_progress");
  });

  it("selects five kanji and three grammar from mastery pools", () => {
    expect(lessonPlan).toContain("selectFromLowestMasteryPool(");
    expect(lessonPlan).toMatch(/\n    5,\n  \);/);
    expect(lessonPlan).toMatch(/\n    3,\n  \);/);
  });
});
