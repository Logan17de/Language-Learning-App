import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const result = readFileSync("components/lesson/lesson-result.tsx", "utf8");
const repo = readFileSync("lib/repositories/progress-repository.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260824030707_learner_level_mastery_summary.sql",
  "utf8",
);

describe("the completion screen reports standing, not stopwatch", () => {
  it("no longer shows how long the lesson took", () => {
    expect(result).not.toContain("Lesson duration");
    expect(result).not.toContain("durationMinutes} min");
  });

  it("shows average mastery for the level and everything below it", () => {
    expect(result).toContain("levelMastery.averageMastery");
    expect(result).toContain("and below mastered");
    expect(repo).toContain("async levelMastery()");
    expect(repo).toContain('client.rpc("learner_level_mastery")');
  });

  it("shows a placeholder rather than a wrong number while loading", () => {
    expect(result).toContain('levelMastery ? `${levelMastery.averageMastery}%` : "—"');
  });
});

describe("the measure matches the rule it reports on", () => {
  it("scopes to the current level and every level below", () => {
    // The same comparison claim_level_promotion makes.
    expect(migration).toContain("record.jlpt_level <= v_level");
    expect(migration).toContain("item_type = 'kanji'");
    expect(migration).toContain("item_type = 'vocabulary'");
    expect(migration).toContain("item_type = 'grammar'");
  });

  it("averages rather than counting past a threshold", () => {
    // get_learner_progress_summary already counts, and counts at 70 while
    // promotion needs 80; two numbers disagreeing about one idea is worse than
    // one number with no threshold in it.
    expect(migration).toContain("round(avg(mastery.mastery))");
    expect(migration).toContain("filter (where mastery.mastery >= 80)");
  });

  it("is readable by the learner and nobody else", () => {
    expect(migration).toContain("revoke all on function public.learner_level_mastery() from public, anon");
    expect(migration).toContain("grant execute on function public.learner_level_mastery() to authenticated");
  });
});
