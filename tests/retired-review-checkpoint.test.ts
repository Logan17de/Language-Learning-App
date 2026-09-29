import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checkpoints = readFileSync(
  "lib/custom-lessons/checkpoint-validation.ts",
  "utf8",
);
const migration = readFileSync(
  "supabase/migrations/20260814070000_retire_final_review_checkpoint.sql",
  "utf8",
);

describe("retired final review checkpoint", () => {
  it("keeps only the three current durable activity groups", () => {
    expect(checkpoints).toContain('"vocabulary_and_kanji"');
    expect(checkpoints).toContain('"grammar_and_reading"');
    expect(checkpoints).toContain('"listening_and_speaking"');
    expect(checkpoints).not.toContain('| "final_review"');
  });

  it("prevents the historical review_group column from blocking three-group jobs", () => {
    expect(migration).toContain("alter column review_group");
    expect(migration).toContain('set default \'{"reviewQuestions":[]}\'::jsonb');
    expect(migration).toContain("where review_group is null");
    expect(migration).toContain("array_remove(completed_groups, 'final_review')");
    expect(migration).toContain("array_remove(failed_groups, 'final_review')");
  });
});
