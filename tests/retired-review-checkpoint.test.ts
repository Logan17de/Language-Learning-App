import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkpoints = readFileSync(
  "lib/custom-lessons/checkpoint-validation.ts",
  "utf8",
);
const activityGroups = readFileSync(
  "lib/gemini/lesson-activity-groups.ts",
  "utf8",
);
const worker = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
const cleanupMigration = readFileSync(
  "supabase/migrations/20260817161000_drop_final_review_generation_compat.sql",
  "utf8",
);

describe("retired final review checkpoint", () => {
  it("keeps only the three current durable activity groups", () => {
    expect(checkpoints).toContain('"vocabulary_and_kanji"');
    expect(checkpoints).toContain('"grammar_and_reading"');
    expect(checkpoints).toContain('"listening_and_speaking"');
    expect(checkpoints).not.toContain('| "final_review"');
    expect(activityGroups).not.toContain("generateFinalReviewActivities");
    expect(worker).not.toContain("review_group");
    expect(worker).not.toContain("ReviewGroup");
  });

  it("drops the historical durable review checkpoint instead of carrying an empty payload", () => {
    expect(cleanupMigration).toContain("drop column if exists review_group");
    expect(cleanupMigration).toContain("drop function if exists public.default_empty_progressive_review_group()");
    expect(cleanupMigration).toContain("array_remove(completed_groups, 'final_review')");
    expect(cleanupMigration).toContain("array_remove(failed_groups, 'final_review')");
    expect(cleanupMigration).toContain("group_attempts = group_attempts - 'final_review'");
    expect(cleanupMigration).toContain("p_group not in (");
    expect(cleanupMigration).not.toContain("'final_review'\n  ) then");
  });

  it("rejects review payloads from the current stored lesson contract", () => {
    expect(cleanupMigration).toContain("if p_package ? 'reviewQuestions' then");
    expect(cleanupMigration).toContain("reviewQuestions is retired");
  });
});
