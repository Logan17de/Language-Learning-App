import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storyCall = readFileSync(
  "lib/gemini/adaptive-story-generation.ts",
  "utf8",
);
const enrichmentCall = readFileSync(
  "lib/gemini/story-enrichment-v3.ts",
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

  it("runs one dedicated second call for lexical enrichment and stores only missing records", () => {
    expect(enrichmentCall).toContain("API call 2");
    expect(enrichmentCall).toContain("Do not rewrite, shorten, extend, or correct");
    expect(enrichmentCall).toContain("dictionaryForm");
    expect(enrichmentCall).toContain("dictionaryReading");
    expect(enrichmentCall).toContain("meaning");
    expect(enrichmentCall).toContain("missingVocabulary");
    expect(enrichmentCall).toContain("unknownKanji");
    expect(enrichmentCall).toContain('rpc("enrich_custom_lesson_library_v3"');
    expect(route.indexOf("generateAdaptiveStoryDraft")).toBeLessThan(
      route.indexOf("enrichStoryAndResolveLibraryV3"),
    );
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

  it("sends exact provisional QA to a separate approval model before persistence", () => {
    expect(validator).toContain("approval-only Japanese question-and-answer validator");
    expect(validator).toContain("Return exactly one verdict for every requestIndex");
    expect(validator).toContain("mentally insert the answer");
    expect(validator).toContain("genuinely tests every supplied targetItemId");
    expect(validator).toContain("The item is unambiguous");
    expect(validator).toContain("do not expose the answer");
    expect(runner).toContain("const approval = await approveActivityQuestionsWithAI");
    expect(runner.indexOf("const approval = await approveActivityQuestionsWithAI")).toBeLessThan(
      runner.indexOf("await persistGroup(admin, job, group, generated.value, audit)"),
    );
    expect(runner).toContain('if (group !== "final_review")');
    expect(validator).toContain("interactive speaking, and final review are intentionally not");
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
