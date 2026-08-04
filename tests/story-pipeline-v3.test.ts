import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeStoryPassage } from "../lib/gemini/story-pipeline-v3";

const storyCall = readFileSync(
  "lib/gemini/adaptive-story-generation.ts",
  "utf8",
);
const storyContract = readFileSync(
  "lib/gemini/story-generation-contract.ts",
  "utf8",
);
const simpleEnrichment = readFileSync(
  "lib/gemini/simple-story-enrichment.ts",
  "utf8",
);
const simpleEnrichmentContract = readFileSync(
  "lib/gemini/simple-story-enrichment-contract.ts",
  "utf8",
);
const existingLibrary = readFileSync(
  "lib/gemini/story-library-existing-only.ts",
  "utf8",
);
const plan = readFileSync("lib/gemini/lesson-plan-v3.ts", "utf8");
const route = readFileSync(
  "app/api/custom-lessons/generate/route.ts",
  "utf8",
);
const validator = readFileSync(
  "lib/gemini/activity-validator-ai.ts",
  "utf8",
);
const runner = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
const structured = readFileSync("lib/openai/structured-output.ts", "utf8");
const structuredText = readFileSync("lib/openai/structured-text.ts", "utf8");
const compatibilityExport = readFileSync(
  "lib/gemini/structured-output.ts",
  "utf8",
);
const inspectable = readFileSync(
  "components/exercises/inspectable-text.tsx",
  "utf8",
);
const progressiveStory = readFileSync(
  "components/lesson/progressive-story-page.tsx",
  "utf8",
);
const storyPhase = readFileSync(
  "components/lesson/story-phase.tsx",
  "utf8",
);
const audioControl = readFileSync(
  "components/exercises/audio-control.tsx",
  "utf8",
);
const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const listening = readFileSync("components/lesson/listening-phase.tsx", "utf8");
const storedAudio = readFileSync("lib/audio/audio-library.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260730070000_story_pipeline_and_kanji_exposure.sql",
  "utf8",
);
const enrichmentMigration = readFileSync(
  "supabase/migrations/20260804090000_simple_story_vocabulary_enrichment.sql",
  "utf8",
);

describe("custom lesson story pipeline v3", () => {
  it("makes call 1 a continuous 10-15 sentence passage with one selected interest", () => {
    expect(storyContract).toContain("const STORY_MIN_SENTENCES = 10");
    expect(storyContract).toContain("const STORY_MAX_SENTENCES = 15");
    expect(storyContract).toContain('"selected_interest"');
    expect(storyContract).toContain('"japanese_story"');
    expect(storyContract).toContain('"english_translation"');
    expect(storyContract).toContain("Available learner interests");
    expect(storyContract).toContain("Select exactly one learner interest");
    expect(storyContract).toContain("one continuous string, not an array");
    expect(storyCall).toContain('name: "japanese_lesson"');
    expect(storyCall).toContain("strictSchema: true");
    expect(storyCall).toContain("exactSchemaName: true");
    expect(storyCall).toContain("normalizeStoryPassage(result.value)");
    expect(storyCall).not.toContain('required: [\n              "surface"');
    expect(plan).toContain('.from("user_preferences")');
    expect(plan).toContain('.from("profiles")');
  });

  it("normalizes the new passage response into one backward-compatible reader line", () => {
    const draft = normalizeStoryPassage({
      selected_interest: "Travel",
      japanese_title: "東京の一日",
      english_title: "A Day in Tokyo",
      japanese_story: "朝、東京へ行きました。友達と駅で会いました。",
      english_translation: "I went to Tokyo in the morning. I met my friend at the station.",
    });

    expect(draft.title).toBe("A Day in Tokyo");
    expect(draft.japaneseTitle).toBe("東京の一日");
    expect(draft.tags).toEqual(["Travel"]);
    expect(draft.storyPreview).toBe("朝、東京へ行きました。");
    expect(draft.summary).toBe("I went to Tokyo in the morning.");
    expect(draft.lines).toEqual([{
      japanese: "朝、東京へ行きました。友達と駅で会いました。",
      english: "I went to Tokyo in the morning. I met my friend at the station.",
    }]);
  });

  it("enriches every raw story word before resolving library-backed taps", () => {
    expect(existingLibrary).toContain("resolveStoryFromExistingLibrary");
    expect(existingLibrary).toContain("buildFormIndex");
    expect(existingLibrary).toContain("composeEntryForm");
    expect(existingLibrary).toContain("Story words become tappable");
    expect(existingLibrary).toContain('model: "existing-library-only"');
    expect(existingLibrary).not.toContain("generateStructured");
    expect(existingLibrary).not.toContain("OPENAI_API_KEY");
    expect(simpleEnrichment).toContain('name: "story_vocabulary"');
    expect(simpleEnrichment).toContain("strictSchema: true");
    expect(simpleEnrichment).toContain("exactSchemaName: true");
    expect(simpleEnrichment).toContain("storyEnrichmentPrompt(japaneseStory)");
    expect(simpleEnrichment).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(simpleEnrichmentContract).toContain("List every unique vocabulary word exactly as it appears");
    expect(simpleEnrichmentContract).toContain('required: ["word", "reading", "meaning"]');
    expect(route).toContain("resolveStoryFromExistingLibrary");
    expect(route).toContain("enrichGeneratedStoryVocabulary");
    expect(route.indexOf("enrichGeneratedStoryVocabulary")).toBeLessThan(
      route.indexOf("resolveStoryFromExistingLibrary(client"),
    );
    expect(route).toContain('libraryMode: "raw-story-enrichment"');
    expect(enrichmentMigration).toContain("create table if not exists public.story_vocabulary_enrichments");
    expect(enrichmentMigration).toContain("word text not null");
    expect(enrichmentMigration).toContain("reading text not null");
    expect(enrichmentMigration).toContain("meaning text not null");
    expect(enrichmentMigration).not.toContain("v_dictionary_form :=");
    expect(enrichmentMigration).toContain("v_word,\n      v_word,\n      v_reading");
    expect(route).not.toContain("resolveStoryLibraryV4");
  });

  it("shows justified Japanese and English passages while retaining old line compatibility", () => {
    expect(progressiveStory).toContain("english: string");
    expect(progressiveStory).toContain("japanesePassage");
    expect(progressiveStory).toContain("englishPassage");
    expect(progressiveStory).toContain('textJustify: "inter-character"');
    expect(progressiveStory).toContain('textJustify: "inter-word"');
    expect(progressiveStory).toContain('English story');
    expect(progressiveStory.indexOf('English story')).toBeGreaterThan(
      progressiveStory.indexOf('<InspectableText text={japanesePassage}'),
    );
    expect(storyPhase).toContain('English story');
    expect(storyPhase).toContain('{line.english}');
    expect(storyPhase).toContain('textJustify: "inter-character"');
    expect(storyPhase).toContain('textJustify: "inter-word"');
    expect(storyPhase.indexOf('English story')).toBeGreaterThan(
      storyPhase.indexOf('segmentStoredStoryLine(line.japanese'),
    );
  });

  it("uses GPT-5.6 Luna through the stateless OpenAI Responses API", () => {
    expect(structured).toContain('"gpt-5.6-luna"');
    expect(structured).toContain("OPENAI_API_KEY");
    expect(structured).toContain("OPENAI_STORY_MODEL");
    expect(structured).toContain("OPENAI_VALIDATOR_MODEL");
    expect(structured).toContain("OPENAI_STORY_REASONING_EFFORT");
    expect(structured).toContain("OpenAI structured generation completed");
    expect(structured).toContain("parseJsonOrJsonl");
    expect(structuredText).toContain("object-based JSONL");
    expect(structuredText).toContain("Object.assign({}, ...records)");
    expect(structured).not.toContain("GEMINI_");
    expect(compatibilityExport).toContain("@/lib/openai/structured-output");
    expect(route).toContain("separate simple vocabulary-enrichment call");
  });

  it("throttles and retries only transient structured model failures", () => {
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_MAX_CONCURRENCY");
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_RETRIES");
    expect(compatibilityExport).toContain("acquireCallSlot");
    expect(compatibilityExport).toContain("transientModelError");
    expect(compatibilityExport).toContain("Retrying transient OpenAI structured generation");
    expect(compatibilityExport).toContain("finally");
    expect(compatibilityExport).toContain("release()");
  });

  it("shows readings for unknown kanji and marks them known at ten appearances", () => {
    expect(inspectable).toContain("［{segment.word.reading}］");
    expect(inspectable).toContain("text-persimmon-600");
    expect(route).toContain('rpc("record_story_kanji_exposures"');
    expect(plan).toContain('.gte("appearance_count", 10)');
    expect(migration).toContain("appearance_count >= 10");
    expect(migration).toContain("knownThreshold', 10");
    expect(migration).toContain("primary key (user_id, request_id, character)");
    expect(migration).toContain("on conflict (user_id, request_id, character) do nothing");
  });

  it("keeps approved QA regions and repairs rejected questions with bounded load", () => {
    expect(validator).toContain("approval-only Japanese question-and-answer validator");
    expect(validator).toContain("Return exactly one verdict for every requestIndex");
    expect(validator).toContain("Mentally insert blank answers");
    expect(validator).toContain("exactly one primary targetItemId");
    expect(validator).toContain("The item is unambiguous");
    expect(validator).toContain("do not expose the answer");
    expect(validator).toContain("Approved neighboring questions survive unchanged");
    expect(validator).toContain("const MAX_ISOLATED_REPAIR_ATTEMPTS = 3");
    expect(validator).toContain("const MAX_PARALLEL_REPAIRS = 2");
    expect(validator).toContain("for (let attempt = 1; attempt <= MAX_ISOLATED_REPAIR_ATTEMPTS");
    expect(validator).toContain("Rebuild this one question cleanly from its canonical targets");
    expect(validator).toContain("Custom lesson question repair needs another isolated attempt");
    expect(validator).toContain("mapWithConcurrency");
    expect(validator).not.toContain("Promise.all(rejected.map");
    expect(validator).toContain("questions[verdict.requestIndex] = repairs[index]!.question");
    expect(validator).toContain("repairs.reduce((total, item) => total + item.validationCalls, 0)");
    expect(runner).toContain("const approval = await approveActivityQuestionsWithAI");
    expect(runner.indexOf("const approval = await approveActivityQuestionsWithAI")).toBeLessThan(
      runner.indexOf("await persistGroup(admin, job, group, payload, audit)"),
    );
    expect(runner).toContain("payload = approval.payload as GroupPayload");
    expect(runner).toContain('if (group !== "final_review")');
  });

  it("records exact group errors and does not mislabel finalization failures", () => {
    expect(runner).toContain('console.error("Custom lesson activity groups failed."');
    expect(runner).toContain("failures: details");
    expect(runner).toContain("failedGroups.map((group, index)");
    expect(runner).toContain("markFinalizationFailure");
    expect(runner).toContain('console.error("Custom lesson finalization failed."');
    expect(runner).toContain("libraryCounts");
    expect(runner).toContain("return markFinalizationFailure(admin, refreshed, error)");
  });

  it("keeps the story-first flow fast after the single story call", () => {
    expect(plan).toContain("unstable_cache");
    expect(plan).toContain("lesson-plan-v3-static-catalog");
    expect(route).toContain("Custom lesson story pipeline timings");
    expect(route).toContain("const [saved, exposure] = await Promise.all");
    expect(route).toContain("libraryLookupMs");
    expect(route).toContain("tappableVocabularyCount");
    expect(structured).toContain("durationMs");
    expect(structured).toContain("attempts");
    expect(structured).toContain("cachedInputTokens");
  });

  it("keeps reading STT-only and listening stored-TTS plus MCQ-only", () => {
    expect(reading).toContain("MediaRecorder");
    expect(reading).toContain('/api/audio/transcribe');
    expect(audioControl).toContain('const readingSttOnly = label === "Hear this line"');
    expect(audioControl).toContain("if (readingSttOnly) return null");
    expect(listening).toContain("<AudioControl");
    expect(listening).toContain("<MultipleChoiceCard");
    expect(listening).not.toContain("MediaRecorder");
    expect(listening).not.toContain("/api/audio/transcribe");
    expect(storedAudio).toContain('.from("lesson_listening_activities")');
    expect(storedAudio).not.toContain('.from("lesson_reading_sections")');
  });

  it("leaves speaking and final review generation intact", () => {
    expect(runner).toContain("generateListeningAndSpeakingActivities");
    expect(runner).toContain("generateFinalReviewActivities");
    expect(validator).not.toContain("speakingExercises:");
    expect(validator).not.toContain("reviewQuestions:");
  });
});
