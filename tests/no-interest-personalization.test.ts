import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const generationRoute = source("app/api/custom-lessons/generate/route.ts");
const entitlementMigration = source(
  "supabase/migrations/20260819115000_learn_entitlement_security_closure.sql",
);
const interestContractMigration = source(
  "supabase/migrations/20260819122500_remove_custom_lesson_interest_contract.sql",
);

describe("learner interests never personalize lessons", () => {
  it("starts lessons from only the explicit /learn topic and JLPT level", () => {
    expect(generationRoute).toContain("const topic =");
    expect(generationRoute).toContain("const level = input.level");
    expect(generationRoute).toContain('rawClient.rpc("begin_custom_lesson_generation_v5"');
    expect(generationRoute).toContain("p_topic: topic");
    expect(generationRoute).toContain("p_level: level");
    expect(generationRoute.toLowerCase()).not.toContain("interest");
  });

  it("does not send interests into planning, activity generation, or prompts", () => {
    for (const path of [
      "lib/custom-lessons/job-runner.ts",
      "lib/custom-lessons/fast-path.ts",
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

  it("does not use interests in learner scoring, mastery, or lesson persistence", () => {
    for (const path of [
      "lib/sync/backend-sync.ts",
      "lib/repositories/lesson-session-repository.ts",
      "lib/lesson-phase-progress.ts",
      "lib/repositories/lesson-repository.ts",
    ]) {
      expect(source(path).toLowerCase(), path).not.toContain("interest");
    }
  });

  it("uses only requested level and normalized topic for exact lesson reuse", () => {
    expect(entitlementMigration).toContain("v_normalized_topic := public.normalize_lesson_topic(p_topic)");
    expect(entitlementMigration).toContain("candidate.jlpt_level = p_level");
    expect(entitlementMigration).toContain("candidate.normalized_topic = v_normalized_topic");
    expect(entitlementMigration).not.toContain("v_interests");
  });

  it("keeps the daily quota boundary independent from interests", () => {
    const start = entitlementMigration.indexOf(
      "create or replace function public.lesson_quota_timezone",
    );
    const end = entitlementMigration.indexOf(
      "create or replace function public.begin_custom_lesson_generation_v5",
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(entitlementMigration.slice(start, end).toLowerCase()).not.toContain(
      "interest",
    );
  });

  it("removes the interest field from the active assignment/storage contract", () => {
    expect(interestContractMigration).toContain(
      "drop function if exists public.begin_custom_lesson_generation_v2",
    );
    expect(interestContractMigration).toContain(
      "drop function if exists public.begin_custom_lesson_generation_v3",
    );
    expect(interestContractMigration).toContain(
      "drop function if exists public.begin_custom_lesson_generation_v4",
    );
    expect(interestContractMigration).toContain(
      "drop function if exists public.store_generated_lesson_package(uuid, jsonb, integer)",
    );
    expect(interestContractMigration).toContain(
      "v_definition := replace(v_definition, '''pro_custom''', '''custom_topic''')",
    );
    expect(interestContractMigration).toContain(
      "column_name ilike '%interest%'",
    );
    // The replay guard inspects public normal functions behind an OFFSET 0
    // fence, so pg_get_functiondef() can never reach a pg_catalog aggregate.
    expect(interestContractMigration).toContain("and p.prokind = 'f'");
    expect(interestContractMigration).toContain("offset 0");
    expect(interestContractMigration).toContain(
      "pg_get_functiondef(public_function.oid) ilike '%interest_matches%'",
    );
    expect(interestContractMigration).toContain(
      "pg_get_functiondef(public_function.oid) ilike '%profiles.interests%'",
    );
    expect(interestContractMigration).toContain(
      "pg_get_functiondef(public_function.oid) ilike '%pro_interest%'",
    );
  });

  it("allows old assignment modes only as inactive history", () => {
    expect(interestContractMigration).toContain("selection_mode = 'custom_topic'");
    expect(interestContractMigration).toContain(
      "selection_mode in ('standard', 'pro_custom')",
    );
    expect(interestContractMigration).toContain(
      "status in ('completed', 'abandoned')",
    );
    expect(interestContractMigration).not.toContain("selection_mode = 'pro_interest'");
  });

  it("does not advertise interest personalization as a product feature", () => {
    expect(source("app/page.tsx").toLowerCase()).not.toContain("interest");
    expect(source("components/subscription/subscription-page.tsx").toLowerCase()).not.toContain("interest");
  });
});
