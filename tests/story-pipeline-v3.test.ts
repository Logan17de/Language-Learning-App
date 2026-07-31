import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storyCall = readFileSync(
  "lib/gemini/adaptive-story-generation.ts",
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
const compatibilityExport = readFileSync(
  "lib/gemini/structured-output.ts",
  "utf8",
);
const inspectable = readFileSync(
  "components/exercises/inspectable-text.tsx",
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

describe("custom lesson story pipeline v3", () => {
  it("makes call 1 story-only with 10-12 lines and optional onboarding interests", () => {
    expect(storyCall).toContain("const STORY_MIN_LINES = 10");
    expect(storyCall).toContain("const STORY_MAX_LINES = 12");
    expect(storyCall).toContain("Learner's natural interests");
    expect(storyCall).toContain("input.plan.interests.length > 0");
    expect(storyCall).toContain("Return only story metadata");
    expect(storyCall).toContain("Do not return vocabulary terms, tokenization");
    expect(storyCall).not.toContain('required: [\n              "surface"');
    expect(plan).toContain('.from("user_preferences")');
    expect(plan).toContain('.from("profiles")');
  });

  it("uses only existing library records for story taps and never enriches them", () => {
    expect(existingLibrary).toContain("resolveStoryFromExistingLibrary");
    expect(existingLibrary).toContain("buildFormIndex");
    expect(existingLibrary).toContain("composeEntryForm");
    expect(existingLibrary).toContain("Story words become tappable");
    expect(existingLibrary).toContain('model: "existing-library-only"');
    expect(existingLibrary).not.toContain("generateStructured");
    expect(existingLibrary).not.toContain("OPENAI_API_KEY");
    expect(existingLibrary).not.toContain("enrich_custom_lesson_library_v3");
    expect(route).toContain("resolveStoryFromExistingLibrary");
    expect(route).toContain("Missing words are left as plain text");
    expect(route).toContain('libraryMode: "existing-library-only"');
    expect(route).not.toContain("resolveStoryLibraryV4");
    expect(route).not.toContain("enrichmentRepaired");
    expect(route).not.toContain("enrichmentModel");
  });

  it("uses GPT-5.6 Luna through the stateless OpenAI Responses API", () => {
    expect(structured).toContain('"gpt-5.6-luna"');
    expect(structured).toContain("OPENAI_API_KEY");
    expect(structured).toContain("OPENAI_STORY_MODEL");
    expect(structured).toContain("OPENAI_VALIDATOR_MODEL");
    expect(structured).toContain("OPENAI_STORY_REASONING_EFFORT");
    expect(structured).toContain("OpenAI structured generation completed");
    expect(structured).not.toContain("GEMINI_");
    expect(compatibilityExport).toContain("@/lib/openai/structured-output");
    expect(route).toContain("The only model call before the story is shown");
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

  it("keeps approved QA regions and retries only rejected questions in parallel", () => {
    expect(validator).toContain("approval-only Japanese question-and-answer validator");
    expect(validator).toContain("Return exactly one verdict for every requestIndex");
    expect(validator).toContain("Mentally insert blank answers");
    expect(validator).toContain("genuinely tests every supplied targetItemId");
    expect(validator).toContain("The item is unambiguous");
    expect(validator).toContain("do not expose the answer");
    expect(validator).toContain("Approved neighboring questions survive unchanged");
    expect(validator).toContain("const MAX_ISOLATED_REPAIR_ATTEMPTS = 3");
    expect(validator).toContain("for (let attempt = 1; attempt <= MAX_ISOLATED_REPAIR_ATTEMPTS");
    expect(validator).toContain("Rebuild this one question cleanly from its canonical targets");
    expect(validator).toContain("Custom lesson question repair needs another isolated attempt");
    expect(validator).toContain("Promise.all(rejected.map");
    expect(validator).toContain("questions[verdict.requestIndex] = repairs[index]!.question");
    expect(validator).toContain("repairs.reduce((total, item) => total + item.validationCalls, 0)");
    expect(runner).toContain("const approval = await approveActivityQuestionsWithAI");
    expect(runner.indexOf("const approval = await approveActivityQuestionsWithAI")).toBeLessThan(
      runner.indexOf("await persistGroup(admin, job, group, generated.value, audit)"),
    );
    expect(runner).toContain('if (group !== "final_review")');
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
