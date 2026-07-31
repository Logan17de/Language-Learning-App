import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const form = readFileSync("components/custom-topic/custom-topic-page.tsx", "utf8");
const progressiveReader = readFileSync(
  "components/custom-topic/progressive-lesson-page.tsx",
  "utf8",
);
const route = readFileSync("app/api/custom-lessons/generate/route.ts", "utf8");
const completionRoute = readFileSync("app/api/custom-lessons/complete/route.ts", "utf8");
const statusRoute = readFileSync("app/api/custom-lessons/status/route.ts", "utf8");
const workerRoute = readFileSync("app/api/internal/custom-lessons/process/route.ts", "utf8");
const runner = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
const groups = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");
const audio = readFileSync("lib/audio/audio-library.ts", "utf8");
const durableMigration = readFileSync(
  "supabase/migrations/20260728010000_durable_custom_lesson_jobs.sql",
  "utf8",
);
const targets = readFileSync("lib/gemini/lesson-targets.ts", "utf8");
const generation = readFileSync("lib/gemini/lesson-generation.ts", "utf8");
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
    expect(route).toContain('begin_custom_lesson_generation_v3');
    expect(route).toContain('p_topic: topic');
    expect(route).toContain('p_level: level');
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
    expect(progressiveReader).toContain("Story audio is off");
    expect(progressiveReader).toContain("Lesson readiness");
    expect(progressiveReader).not.toContain("<AudioControl");
    expect(form).toContain("AbortSignal.timeout(180_000)");
    expect(route).toContain('status: "story_ready"');
    expect(route).toContain("buildInteractiveStory");
    expect(route).toContain("after(async () =>");
    expect(route).toContain("processCustomLessonJobs");
    expect(completionRoute).not.toContain("generatePlayableLesson");
    expect(completionRoute).toContain("status: \"activities_queued\"");
    expect(statusRoute).toContain('.eq("user_id", auth.userId)');
  });

  it("uses durable atomic claims and independently persisted parallel groups", () => {
    expect(workerRoute).toContain("CUSTOM_LESSON_WORKER_SECRET");
    expect(workerRoute).toContain("CRON_SECRET");
    expect(runner).toContain("Promise.allSettled(executions)");
    expect(runner).toContain('rpc("claim_progressive_lesson_job"');
    expect(runner).toContain('rpc("save_progressive_lesson_group"');
    expect(runner).toContain('rpc("store_generated_lesson_package_background"');
    expect(groups).toContain("generateVocabularyAndKanjiActivities");
    expect(groups).toContain("generateGrammarAndReadingActivities");
    expect(groups).toContain("generateListeningAndSpeakingActivities");
    expect(groups).toContain("generateFinalReviewActivities");
    expect(groups).toContain("6 Easy, 4 Medium, 3 Hard");
    expect(groups).toContain("visible Japanese sentence beginning in hintFront");
    expect(durableMigration).toContain("for update skip locked");
    expect(durableMigration).toContain("interval '10 minutes'");
    expect(durableMigration).toContain("completed_groups");
  });

  it("keeps model-controlled identifiers out of library enrichment", () => {
    const engine = readFileSync("lib/gemini/lesson-engine-v2.ts", "utf8");
    const mapping = readFileSync("lib/gemini/library-enrichment-mapping.ts", "utf8");
    expect(engine).toContain("mapLibraryEnrichment");
    expect(mapping).toContain("requestIndex");
    expect(mapping).toContain("Do not output character, pattern, writtenForm");
    expect(mapping).toContain("linkedKanjiForWord");
  });

  it("publishes lesson content before audio and limits TTS to voice activities", () => {
    expect(runner.indexOf('status: "lesson_ready"')).toBeLessThan(
      runner.indexOf("prepareAudioJob(admin, refreshed.request_id)"),
    );
    expect(audio).toContain('.from("lesson_listening_activities")');
    expect(audio).toContain('.from("lesson_speaking_activities")');
    expect(audio).not.toContain('.from("lesson_story_lines")');
    expect(audio).not.toContain('.from("lesson_reading_sections")');
  });

  it("enriches only missing library categories before selecting targets", () => {
    expect(targets).toContain("libraryNeedsEnrichment");
    expect(targets).toContain("generateLessonLibrarySeed");
    expect(targets).toContain("enrich_custom_lesson_library");
    expect(targets).toContain("selectedKanjiNeedDetails ? seed.kanji : []");
    expect(targets).toContain("selectedGrammarNeedDetails ? seed.grammar : []");
    expect(targets).toContain("vocabularyRows.length < 20 ? seed.vocabulary : []");
    expect(targets).toContain('.from("kanji_catalog")');
    expect(targets).toContain('.from("grammar_catalog")');
    expect(generation).toContain("Required kanji (exact)");
    expect(generation).toContain("Required grammar patterns (exact)");
    expect(generation).toContain("Every meaningful Japanese content word or kanji");
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
