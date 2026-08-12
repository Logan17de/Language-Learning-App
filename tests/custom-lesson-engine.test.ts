import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync("components/custom-topic/custom-topic-page.tsx", "utf8");
const progressiveReader = readFileSync(
  "components/lesson/progressive-story-page.tsx",
  "utf8",
);
const route = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const completionRoute = readFileSync("app/api/custom-lessons/complete/route.ts", "utf8");
const statusRoute = readFileSync("app/api/custom-lessons/status/route.ts", "utf8");
const workerRoute = readFileSync("app/api/internal/custom-lessons/process/route.ts", "utf8");
const workerAuthorization = readFileSync(
  "lib/custom-lessons/worker-authorization.ts",
  "utf8",
);
const runner = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
const groups = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");
const checkpoints = readFileSync("lib/custom-lessons/checkpoint-validation.ts", "utf8");
const placeholderEnrichment = readFileSync("lib/custom-lessons/placeholder-enrichment.ts", "utf8");
const storyEnrichment = readFileSync("lib/gemini/simple-story-enrichment.ts", "utf8");
const readingGeneration = readFileSync("lib/gemini/reading-region-generation.ts", "utf8");
const listeningGeneration = readFileSync("lib/gemini/listening-region-generation.ts", "utf8");
const speakingGeneration = readFileSync("lib/gemini/speaking-region-generation.ts", "utf8");
const audio = readFileSync("lib/audio/audio-library.ts", "utf8");
const durableMigration = readFileSync(
  "supabase/migrations/20260810090000_stage_based_custom_lesson_jobs.sql",
  "utf8",
);
const scheduler = readFileSync(
  "supabase/migrations/20260810100000_supabase_custom_lesson_scheduler.sql",
  "utf8",
);
const identityMigration = readFileSync(
  "supabase/migrations/20260812180000_catalog_identity_only_lesson_targets.sql",
  "utf8",
);
const quota = readFileSync(
  "supabase/migrations/20260727003000_failed_custom_lessons_do_not_consume_quota.sql",
  "utf8",
);
const catalog = JSON.parse(readFileSync("data/jlpt-catalog.json", "utf8")) as {
  counts: {
    kanji: Record<string, number>;
    grammar: Record<string, number>;
  };
  kanji: unknown[];
  grammar: unknown[];
};

describe("custom lesson engine contract", () => {
  it("asks the learner for only topic and level", () => {
    expect(form).toContain('<Field label="Topic">');
    expect(form).toContain('<Field label="Level">');
    expect(form).not.toContain('<Field label="Lesson length">');
    expect(form).not.toContain('<Field label="Preferred focus">');
    expect(form).not.toContain('<Field label="Speaking difficulty">');
    expect(form).not.toContain('<Field label="Optional note">');
    expect(form).toContain("JSON.stringify({ topic, level })");
    expect(route).toContain("begin_custom_lesson_generation_v4");
    expect(route).toContain("p_topic: topic");
    expect(route).toContain("p_level: level");
  });

  it("opens the resolved story in the real reader and polls durable backend progress", () => {
    expect(form).toContain('role="status"');
    expect(form).toContain("AIko is preparing the first phase.");
    expect(form).toContain("Opening the lesson reader");
    expect(form).toContain(
      "router.replace(`/lesson/building/${encodeURIComponent(result.requestId)}`)",
    );
    expect(progressiveReader).toContain("<LessonPlayerShell");
    expect(progressiveReader).toContain("/api/custom-lessons/status?requestId=");
    expect(progressiveReader).toContain('data-testid="lesson-build-toast"');
    expect(form).not.toContain("AbortSignal.timeout");
    expect(route).toContain('status: "queued"');
    expect(route).toContain("{ status: 202 }");
    expect(route).toContain("after(async () =>");
    expect(route).toContain("processCustomLessonJobs");
    expect(completionRoute).not.toContain("generatePlayableLesson");
    expect(completionRoute).toContain("the scheduler will resume it");
    expect(statusRoute).toContain('.eq("user_id", auth.userId)');
  });

  it("uses durable atomic stage claims and independently persisted groups", () => {
    expect(workerRoute).toContain("customLessonWorkerAuthorized");
    expect(workerAuthorization).toContain("CUSTOM_LESSON_WORKER_SECRET");
    expect(workerAuthorization).toContain("CRON_SECRET");
    expect(runner).toContain('rpc("claim_custom_lesson_stage"');
    expect(runner).toContain('rpc("save_progressive_lesson_group"');
    expect(runner).toContain('rpc("store_generated_lesson_package_background"');
    expect(groups).toContain("generateVocabularyAndKanjiActivities");
    expect(groups).toContain("generateGrammarAndReadingActivities");
    expect(groups).toContain("generateListeningAndSpeakingActivities");
    expect(groups).toContain("generateFinalReviewActivities");
    expect(durableMigration).toContain("for update skip locked");
    expect(durableMigration).toContain("interval '8 minutes'");
    expect(durableMigration).toContain("completed_groups");
    expect(runner).toContain("group_attempts");
    expect(scheduler).toContain("net.http_post");
    expect(scheduler).toContain("custom_lesson_worker_url");
    expect(scheduler).toContain("'* * * * *'");
  });

  it("keeps the original JMdict story pass but removes all later enrichment passes", () => {
    expect(storyEnrichment).toContain('DICTIONARY_SOURCE_MODEL = "jmdict-local"');
    expect(storyEnrichment).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(placeholderEnrichment).toContain('model: "catalog-identities-only"');
    expect(placeholderEnrichment).not.toContain("generateStructured");
    for (const source of [readingGeneration, listeningGeneration, speakingGeneration]) {
      expect(source).not.toContain("lookupJapaneseDictionaryVocabulary");
      expect(source).not.toContain("storeGeneratedVocabularyTerms");
      expect(source).not.toContain("DICTIONARY_SOURCE_MODEL");
    }
  });

  it("generates kanji and grammar teaching content in their actual lesson stages", () => {
    expect(groups).toContain("kanjiTeaching");
    expect(groups).toContain("grammarTeaching");
    expect(groups).toContain("adaptKanjiTeaching");
    expect(groups).toContain("adaptGrammarTeaching");
    expect(groups).toContain("kanji: input.groups.vocabularyAndKanji.kanjiTeaching");
    expect(groups).toContain("grammar: input.groups.grammarAndReading.grammarTeaching");
    expect(identityMigration).toContain("lessonTargetIdentityOnly");
    expect(identityMigration).toContain("teachingMetadataRequired");
  });

  it("validates final review structurally without asking the model for database IDs", () => {
    expect(groups).toContain('name: "final_review"');
    expect(groups).toContain("strictSchema: true");
    expect(groups).toContain("exactSchemaName: true");
    expect(groups).toContain("Do not use or output database IDs");
    expect(checkpoints).toContain("Final review must contain exactly 5 questions.");
    expect(checkpoints).not.toContain("requires at least one targetItemId");
  });

  it("publishes lesson content before audio and limits TTS to voice activities", () => {
    expect(runner.indexOf('finishStage(admin, job, "audio", 90')).toBeLessThan(
      runner.indexOf("prepareStoredLessonAudio(job.lesson_version_id, admin)"),
    );
    expect(audio).toContain('.from("lesson_listening_activities")');
    expect(audio).not.toContain('.from("lesson_speaking_activities")');
    expect(audio).not.toContain('.from("lesson_story_lines")');
    expect(audio).not.toContain('.from("lesson_reading_sections")');
  });

  it("normalizes the complete user-provided JLPT catalogs", () => {
    expect(catalog.kanji).toHaveLength(2136);
    expect(catalog.grammar).toHaveLength(641);
    expect(catalog.counts.kanji).toEqual({ N5: 80, N4: 170, N3: 370, N2: 380, N1: 1136 });
    expect(catalog.counts.grammar).toEqual({ N5: 82, N4: 112, N3: 136, N2: 124, N1: 187 });
  });

  it("does not charge failed generation attempts against the daily allowance", () => {
    expect(quota).toContain("and status <> 'failed'");
    expect(quota).toContain("Daily custom lesson limit reached");
  });
});
