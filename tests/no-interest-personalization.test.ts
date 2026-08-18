import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("learner interests are not part of the active product", () => {
  it("does not collect or persist interests in learner UI state", () => {
    for (const path of [
      "components/onboarding/onboarding-flow.tsx",
      "components/profile/profile-form.tsx",
      "store/app-store.ts",
      "types/learner.ts",
      "types/app-preferences.ts",
      "data/default-learner-state.ts",
      "lib/repositories/profile-repository.ts",
      "lib/repositories/progress-repository.ts",
    ]) {
      expect(source(path).toLowerCase(), path).not.toContain("interest");
    }
  });

  it("does not send interests into lesson generation or prompts", () => {
    for (const path of [
      "lib/gemini/adaptive-story-generation.ts",
      "lib/gemini/lesson-plan-v3.ts",
      "lib/gemini/story-pipeline-v3.ts",
      "lib/gemini/story-generation-contract.ts",
      "lib/gemini/reading-comprehension-contract.ts",
      "lib/gemini/lesson-generation.ts",
      "lib/gemini/lesson-types.ts",
      "lib/gemini/lesson-engine-v2.ts",
      "lib/gemini/story-library-existing-only.ts",
    ]) {
      expect(source(path).toLowerCase(), path).not.toContain("interest");
    }
  });

  it("does not expose interest-based assignment metadata in active TypeScript", () => {
    const database = source("types/database.ts").toLowerCase();
    const repository = source("lib/repositories/lesson-repository.ts").toLowerCase();

    expect(database).not.toContain("interest");
    expect(database).not.toContain("pro_interest");
    expect(repository).not.toContain("interest");
    expect(repository).not.toContain("pro_interest");
    expect(repository).toContain('"standard" | "pro_custom"');
  });

  it("removes interest ranking and columns in the current database migration", () => {
    const migration = source(
      "supabase/migrations/20260817150000_remove_interest_personalization.sql",
    );

    expect(migration).toContain("set selection_mode = 'standard'");
    expect(migration).toContain("drop column if exists interest_matches");
    expect(migration).toContain("drop column if exists interests");
    expect(migration).not.toContain("interest_score");
    expect(migration).not.toContain("v_use_interests");
    expect(migration).not.toContain("'pro_interest' end");
  });

  it("does not advertise interests on public or subscription pages", () => {
    expect(source("app/page.tsx").toLowerCase()).not.toContain("interest");
    expect(source("components/subscription/subscription-page.tsx").toLowerCase()).not.toContain("interest");
  });
});
