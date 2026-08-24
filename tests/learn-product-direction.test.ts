import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

const learnPage = source("components/learn/lesson-library.tsx");
const generationRoute = source("app/api/custom-lessons/generate/route.ts");
const legacyRoute = source("app/custom-topic/page.tsx");
const home = source("components/home/home-dashboard.tsx");
const player = source("components/lesson/lesson-player.tsx");
const jobRunner = source("lib/custom-lessons/job-runner.ts");
const entitlementMigration = source(
  "supabase/migrations/20260819070509_learn_custom_topic_daily_entitlement.sql",
);
const finalizeMigration = source(
  "supabase/migrations/20260819070722_consume_free_entitlement_on_lesson_finalize.sql",
);
const modeMigration = source(
  "supabase/migrations/20260819083657_rename_custom_generation_assignment_mode.sql",
);

describe("learn custom-topic product direction", () => {
  it("makes /learn the lesson creation and Resume surface and retires the legacy route", () => {
    expect(learnPage).toContain("Choose the topic. AIko builds the lesson.");
    expect(learnPage).toContain("Resume lesson");
    expect(learnPage).toContain("Start new lesson");
    expect(legacyRoute).toContain('redirect("/learn")');
    expect(learnPage).not.toContain("AIko picks the next lesson");
    expect(learnPage).not.toContain("Your next N5 lesson");
  });

  it("uses the atomic v5 generation contract instead of assignment selection", () => {
    expect(generationRoute).toContain('"begin_custom_lesson_generation_v5"');
    expect(entitlementMigration).toContain("pg_advisory_xact_lock");
    expect(entitlementMigration).toContain("uses_free_daily_entitlement");
    expect(entitlementMigration).toContain("entitlement_local_date = v_local_date");
    expect(entitlementMigration).toContain(
      "candidate.normalized_topic = v_normalized_topic",
    );
    expect(entitlementMigration).not.toContain(
      "position(candidate.normalized_topic in v_normalized_topic)",
    );
  });

  it("consumes free quota only once a usable lesson exists", () => {
    expect(finalizeMigration).toContain("before update of generated_lesson_id");
    expect(finalizeMigration).toContain("new.entitlement_consumed_at := now()");
    expect(entitlementMigration).toContain(
      "status <> 'failed' or entitlement_consumed_at is not null",
    );
  });

  it("keeps all six generated phases while gating protected runtime practice for Free", () => {
    expect(jobRunner).toContain("generateListeningAndSpeakingActivities");
    expect(player).toContain("PremiumPracticeGate");
    expect(player).toContain("Subscribe");
    expect(player).toContain("Skip");
    expect(player).toContain("awards no protected mastery");
  });

  it("preserves phase-atomic Resume instead of abandoning on normal exit", () => {
    expect(player).toContain("restartIncompleteLessonPhase");
    expect(player).toContain("syncLessonProgress(lesson, checkpoint)");
    expect(player).toContain("restart from its first activity");
    expect(player).not.toContain("abandonActive");
    expect(player).not.toContain("resetLessonSession");
  });

  it("sends Home to /learn without assigning a predefined lesson", () => {
    expect(home).toContain('href="/learn"');
    expect(home).toContain("Create or resume a lesson");
    expect(home).not.toContain("useBackendLessonStore");
    expect(home).not.toContain("Choosing lesson");
  });

  it("normalizes new custom assignment terminology to custom_topic", () => {
    expect(entitlementMigration).toContain("'custom_topic'");
    expect(modeMigration).toContain("new.selection_mode = 'pro_custom'");
    expect(modeMigration).toContain("new.selection_mode := 'custom_topic'");
  });
});
