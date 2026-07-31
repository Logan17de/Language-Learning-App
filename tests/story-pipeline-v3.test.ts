import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const storyCall = readFileSync(
  "lib/gemini/adaptive-story-generation.ts",
  "utf8",
);
const enrichmentCall = readFileSync(
  "lib/gemini/story-enrichment-v4.ts",
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

  it("checks the DB first and sends only unresolved word spans to call 2", () => {
    expect(enrichmentCall).toContain("resolveStoryLibraryV4");
    expect(enrichmentCall).toContain("loadVocabularyCandidates");
    expect(enrichmentCall).toContain("buildFormIndex");
    expect(enrichmentCall).toContain("resolveRegions");
    expect(enrichmentCall).toContain("if (preflight.missing.length > 0)");
    expect(enrichmentCall).toContain("missing-word library enrichment");
    expect(enrichmentCall).toContain("Missing word requests");
    expect(enrichmentCall).toContain("The complete story is deliberately not included");
    expect(enrichmentCall).not.toContain("Fixed story:");
    expect(enrichmentCall).toContain("contextJapanese");
    expect(enrichmentCall).toContain("dictionaryForm");
    expect(enrichmentCall).toContain("dictionaryReading");
    expect(enrichmentCall).toContain("kanjiDetails");
    expect(enrichmentCall).toContain('rpc("enrich_custom_lesson_library_v3"');
    expect(enrichmentCall).toContain('generated?.model ?? "local-lexicon-db"');
    expect(route.indexOf("generateAdaptiveStoryDraft")).toBeLessThan(
      route.indexOf("resolveStoryLibraryV4"),
    );
    expect(route).not.toContain("enrichStoryAndResolveLibraryV3");
  });

  it("uses GPT-5.6 Luna through the stateless OpenAI Responses API", () => {
    expect(structured).toContain('"gpt-5.6-luna"');
    expect(structured).toContain("OPENAI_API_KEY");
    expect(structured).toContain("OPENAI_STORY_MODEL");
    expect(structured).toContain("OPENAI_ENRICHMENT_MODEL");
    expect(structured).toContain("OPENAI_VALIDATOR_MODEL");
    expect(structured).toContain("OPENAI_STORY_REASONING_EFFORT");
    expect(structured).toContain("OpenAI structured generation completed");
    expect(structured).not.toContain("GEMINI_");
    expect(compatibilityExport).toContain("@/lib/openai/structured-output");
    expect(route).toContain("OpenAI Responses API call 1");
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

  it("keeps approved QA regions and repairs only rejected questions in parallel", () => {
    expect(validator).toContain("approval-only Japanese question-and-answer validator");
    expect(validator).toContain("Return exactly one verdict for every requestIndex");
    expect(validator).toContain("Mentally insert blank answers");
    expect(validator).toContain("genuinely tests every supplied targetItemId");
    expect(validator).toContain("The item is unambiguous");
    expect(validator).toContain("do not expose the answer");
    expect(validator).toContain("Approved neighboring questions survive unchanged");
    expect(validator).toContain("Promise.all(rejected.map");
    expect(validator).toContain("questions[verdict.requestIndex] = repairs[index]!.question");
    expect(runner).toContain("const approval = await approveActivityQuestionsWithAI");
    expect(runner.indexOf("const approval = await approveActivityQuestionsWithAI")).toBeLessThan(
      runner.indexOf("await persistGroup(admin, job, group, generated.value, audit)"),
    );
    expect(runner).toContain('if (group !== "final_review")');
  });

  it("reduces code-side latency without changing the story-first architecture", () => {
    expect(plan).toContain("unstable_cache");
    expect(plan).toContain("lesson-plan-v3-static-catalog");
    expect(route).toContain("Custom lesson story pipeline timings");
    expect(route).toContain("const [saved, exposure] = await Promise.all");
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
