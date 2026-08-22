import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("components/lesson/lesson-player-shell.tsx", "utf8");
const player = readFileSync("components/lesson/lesson-player.tsx", "utf8");
const sync = readFileSync("lib/sync/backend-sync.ts", "utf8");
const repository = readFileSync("lib/repositories/lesson-session-repository.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260822013915_lesson_phase_skips.sql",
  "utf8",
);

describe("whole lesson-section skipping", () => {
  it("removes the in-lesson Back action and exposes a section skip", () => {
    expect(shell).not.toContain("ArrowLeft");
    expect(shell).not.toContain("> Back");
    expect(shell).toContain("Skip section");
    expect(player).toContain("This whole section will count as zero");
    expect(player).toContain("Skip {phase.label}");
  });

  it("persists an explicit skipped phase instead of fake answers", () => {
    expect(repository).toContain('rawClient.rpc("skip_lesson_phase"');
    expect(sync).toContain("persistPhaseSkip");
    expect(sync).toContain("syncLessonSectionSkip");
    expect(sync).toContain("const preSkipSession");
    expect(sync).toContain("phaseId !== phase");
    expect(migration).toContain("commit_source");
    expect(migration).toContain("'skipped'");
    expect(migration).toContain("'skippedPhaseIds'");
  });

  it("allows completion only after all sections are completed or skipped and scores skips as zero", () => {
    expect(migration).toContain("Every lesson section must be completed or skipped");
    expect(migration).toContain("v_story_pct := 0");
    expect(migration).toContain("v_vocab_pct := 0");
    expect(migration).toContain("v_grammar_pct := 0");
    expect(migration).toContain("v_reading_pct := 0");
    expect(migration).toContain("v_listening_pct := 0");
    expect(migration).toContain("v_speaking_pct := 0");
  });
});
