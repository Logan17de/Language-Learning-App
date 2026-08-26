import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync("components/lesson/mastery-progress.tsx", "utf8");
const result = readFileSync("components/lesson/lesson-result.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260824032218_lesson_mastery_progress.sql",
  "utf8",
);

describe("the completion screen drops the weak-item sections", () => {
  it("no longer offers items to strengthen", () => {
    expect(result).not.toContain("Items to strengthen");
    expect(result).not.toContain("See weak items");
    expect(result).not.toContain("No weak items");
    expect(result).not.toContain("Needs attention");
  });

  it("no longer reports skill changes against hardcoded values", () => {
    // These were fixed numbers with a delta that was always zero.
    expect(result).not.toContain("Skill changes");
    expect(result).not.toContain("function SkillChange");
    expect(result).not.toContain("Kanji recognition");
    expect(result).not.toContain("Pronunciation confidence");
  });
});

describe("mastery is shown as movement, not a number", () => {
  it("runs the bands in order and ends on the overall figure", () => {
    expect(result).toContain("[...result.data.categories, result.data.overall]");
    expect(view).toContain("delayMs={index * 620}");
    expect(view).toContain("emphasised={index === bands.length - 1}");
  });

  it("fills the ground already held before extending into the change", () => {
    expect(view).toContain("setStage(1)");
    expect(view).toContain("setStage(2)");
    expect(view).toContain("Math.min(band.before, band.after)");
    expect(view).toContain("Math.abs(delta)");
  });

  it("shows the change as signed, and can show a fall", () => {
    expect(view).toContain("const rose = delta > 0");
    expect(view).toContain('rose ? "+" : "−"');
    expect(view).toContain('rose ? "text-moss-700" : "text-persimmon-600"');
  });

  it("stays legible without motion", () => {
    // Reduced motion should still land on the right width, just without travel.
    const bars = view.match(/motion-reduce:transition-none/gu) ?? [];
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it("reports the real value to assistive technology", () => {
    expect(view).toContain('role="progressbar"');
    expect(view).toContain("aria-valuenow={clamp(band.after)}");
  });
});

describe("the movement is measured, not guessed", () => {
  it("records where the learner stood when the session began", () => {
    expect(migration).toContain("add column if not exists mastery_snapshot jsonb");
    expect(migration).toContain("before insert on public.lesson_sessions");
  });

  it("uses one definition for the snapshot and the comparison", () => {
    expect(migration).toContain("create or replace function public.learner_mastery_breakdown");
    expect(migration).toContain("v_after := public.learner_mastery_breakdown(v_user, v_level)");
    expect(migration).toContain("new.mastery_snapshot := public.learner_mastery_breakdown");
  });

  it("scopes both readings the way promotion is judged", () => {
    expect(migration).toContain("record.jlpt_level <= p_level");
  });

  it("reports no movement rather than inventing a rise", () => {
    // Sessions that started before snapshots existed have no earlier reading.
    expect(migration).toContain("v_before := coalesce(v_session.mastery_snapshot, v_after)");
    expect(migration).toContain("'hasBaseline'");
  });
});
