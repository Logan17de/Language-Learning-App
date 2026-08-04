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
const activityGroups = readFileSync(
  "lib/gemini/lesson-activity-groups.ts",
  "utf8",
);
const vocabularyContract = readFileSync(
  "lib/gemini/vocabulary-question-contract.ts",
  "utf8",
);
const grammarContract = readFileSync(
  "lib/gemini/grammar-question-contract.ts",
  "utf8",
);
const readingContract = readFileSync(
  "lib/gemini/reading-comprehension-contract.ts",
  "utf8",
);
const readingGeneration = readFileSync(
  "lib/gemini/reading-region-generation.ts",
  "utf8",
);
const listeningContract = readFileSync(
  "lib/gemini/listening-question-contract.ts",
  "utf8",
);
const listeningGeneration = readFileSync(
  "lib/gemini/listening-region-generation.ts",
  "utf8",
);
const speakingContract = readFileSync(
  "lib/gemini/speaking-question-contract.ts",
  "utf8",
);
const speakingGeneration = readFileSync(
  "lib/gemini/speaking-region-generation.ts",
  "utf8",
);
const generatedVocabularyStorage = readFileSync(
  "lib/gemini/generated-vocabulary-storage.ts",
  "utf8",
);
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
const speaking = readFileSync("components/lesson/speaking-phase.tsx", "utf8");
const lessonMapper = readFileSync("lib/repositories/lesson-mapper.ts", "utf8");
const storedAudio = readFileSync("lib/audio/audio-library.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260730070000_story_pipeline_and_kanji_exposure.sql",
  "utf8",
);
const enrichmentMigration = readFileSync(
  "supabase/migrations/20260804090000_simple_story_vocabulary_enrichment.sql",
  "utf8",
);
const readingMigration = readFileSync(
  "supabase/migrations/20260804160000_reading_comprehension_pipeline.sql",
  "utf8",
);
const listeningMigration = readFileSync(
  "supabase/migrations/20260804170000_listening_question_contract.sql",
  "utf8",
);
const speakingMigration = readFileSync(
  "supabase/migrations/20260804220000_speaking_read_aloud_contract.sql",
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

  it("persists tested strict question responses without a second model prompt", () => {
    expect(runner).not.toContain("approveActivityQuestionsWithAI");
    expect(runner).toContain("Every migrated question region now uses its tested strict response");
    expect(runner).toContain(
      "await persistGroup(admin, job, group, generated.value, generated.audit)",
    );
  });

  it("creates vocabulary questions from the exact sample contract", () => {
    expect(activityGroups).toContain('name: "vocab_questions"');
    expect(activityGroups).toContain("vocabularyQuestionsPrompt");
    expect(activityGroups).toContain("vocabularyQuestionsSchema");
    expect(activityGroups).toContain("strictSchema: true");
    expect(activityGroups).toContain("exactSchemaName: true");
    expect(activityGroups).toContain("Vocabulary response must contain at least one question.");
    expect(activityGroups).toContain("targetItemIds: targetId ? [targetId] : []");
    expect(activityGroups).not.toContain(
      "does not target vocabulary or allowed kanji from the story",
    );
    expect(activityGroups).not.toContain(
      "A vocabulary question could not be linked to its story word.",
    );
    expect(vocabularyContract).toContain("Create vocabulary and kanji questions from this Japanese story.");
    expect(vocabularyContract).toContain("Create exactly 13 questions: 6 easy, 4 medium, and 3 hard.");
    expect(vocabularyContract).toContain('required: [\n          "format_id"');
    expect(existingLibrary).toContain("filterStoryPracticeKanji");
    expect(existingLibrary).toContain("knownKanji: input.plan.knownKanji");
    expect(existingLibrary).toContain("targetKanji: input.plan.kanji.map");
  });

  it("reorders model-provided choices during final lesson assembly", () => {
    expect(activityGroups).toContain('withTerms(question, "vocabulary")');
    expect(activityGroups).toContain('withTerms(question, "grammar")');
    expect(activityGroups).toContain('["listening", exercise.prompt, exercise.correctAnswer]');
    expect(activityGroups).toContain(
      '["review", question.category, question.prompt, question.correctAnswer]',
    );
    expect(activityGroups).toContain("shuffledChoices(");
  });

  it("creates grammar questions from the corrected grammar sample contract", () => {
    expect(activityGroups).toContain('name: "grammar_questions"');
    expect(activityGroups).toContain("grammarQuestionsPrompt");
    expect(activityGroups).toContain("grammarQuestionsSchema");
    expect(activityGroups).toContain("rawGrammarQuestionIssues");
    expect(activityGroups).toContain("adaptGrammarQuestions");
    expect(activityGroups).toContain("filterStoryGrammarPatterns");
    expect(activityGroups).toContain("Grammar response must contain at least one question.");
    expect(activityGroups).toContain("targetItemIds: target ? [target.libraryId] : []");
    expect(activityGroups).not.toContain(
      "does not test a provided grammar pattern from the story",
    );
    expect(activityGroups).not.toContain(
      "A grammar question could not be linked to its story pattern.",
    );
    expect(grammarContract).toContain("Create grammar questions from this Japanese story.");
    expect(grammarContract).toContain("Create exactly 10 questions: 3 easy, 4 medium, and 3 hard.");
    expect(grammarContract).toContain("Do not create questions using grammar patterns that do not appear in the story.");
    expect(grammarContract).toContain('required: [\n          "format_id"');
  });

  it("generates, enriches, and questions a separate reading passage in order", () => {
    expect(readingContract).toContain("Generate a Japanese language-learning story for reading.");
    expect(readingContract).toContain("Create reading-comprehension questions from the following Japanese story.");
    expect(readingContract).toContain("Write essay-style questions in Japanese.");
    expect(readingContract).toContain("Medium questions must combine information from two or more story sentences.");
    expect(readingContract).toContain('required: ["difficulty", "question", "answer"]');
    expect(readingGeneration.indexOf("prompt: readingPassagePrompt")).toBeLessThan(
      readingGeneration.indexOf("prompt: storyEnrichmentPrompt(passage.value.japanese_story)"),
    );
    expect(readingGeneration.indexOf("prompt: storyEnrichmentPrompt(passage.value.japanese_story)")).toBeLessThan(
      readingGeneration.indexOf("prompt: readingQuestionsPrompt"),
    );
    expect(readingGeneration).toContain('name: "reading_lesson"');
    expect(readingGeneration).toContain('name: "reading_vocabulary"');
    expect(readingGeneration).toContain('name: "reading_questions"');
    expect(generatedVocabularyStorage).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(readingMigration).toContain("create table public.lesson_reading_questions");
    expect(readingMigration).toContain("jsonb_array_length(p_package->'readingQuestions')");
  });

  it("creates five enriched listening conversations from the exact sample contract", () => {
    expect(listeningContract).toContain("Create exactly 5 listening-comprehension questions");
    expect(listeningContract).toContain("natural Japanese conversation of 5–10 lines");
    expect(listeningContract).toContain('required: [\n          "difficulty"');
    expect(listeningGeneration).toContain('name: "listening_questions"');
    expect(listeningGeneration).toContain("strictSchema: true");
    expect(listeningGeneration).toContain("exactSchemaName: true");
    expect(listeningGeneration).toContain('name: "listening_vocabulary"');
    expect(listeningGeneration.indexOf("prompt: listeningQuestionsPrompt")).toBeLessThan(
      listeningGeneration.indexOf("prompt: storyEnrichmentPrompt(listeningText)"),
    );
    expect(activityGroups).toContain("generateListeningRegion");
    expect(listeningMigration).toContain("add column conversation_lines text[]");
    expect(listeningMigration).toContain("jsonb_array_length(p_package->'listeningExercises') <> 5");
  });

  it("creates five story-grounded read-aloud sentences with the fixed difficulty mix", () => {
    expect(speakingContract).toContain("Create exactly 5 Japanese sentences for read-aloud speaking practice");
    expect(speakingContract).toContain("2 easy, 2 medium, and 1 hard");
    expect(speakingContract).toContain("Do not ask the learner a question");
    expect(speakingContract).toContain("Do not use interrogative sentences");
    expect(speakingGeneration).toContain('name: "speaking_read_aloud"');
    expect(speakingGeneration).toContain("strictSchema: true");
    expect(speakingGeneration).toContain("exactSchemaName: true");
    expect(speakingGeneration).toContain('name: "speaking_vocabulary"');
    expect(speakingGeneration.indexOf("prompt: speakingReadAloudPrompt")).toBeLessThan(
      speakingGeneration.indexOf("prompt: storyEnrichmentPrompt(speakingText)"),
    );
    expect(activityGroups).toContain("generateSpeakingRegion");
    expect(speakingMigration).toContain("v_easy <> 2 or v_medium <> 2 or v_hard <> 1");
    expect(speakingMigration).toContain("question_type = 'read_aloud'");
  });

  it("places speaking between grammar and reading and shows the target sentence", () => {
    expect(lessonMapper.indexOf('id: "grammar"')).toBeLessThan(
      lessonMapper.indexOf('id: "speaking"'),
    );
    expect(lessonMapper.indexOf('id: "speaking"')).toBeLessThan(
      lessonMapper.indexOf('id: "reading"'),
    );
    expect(speaking).toContain("Read the sentence aloud");
    expect(speaking).toContain("text={exercise.modelAnswer}");
    expect(speaking).not.toContain("questionTypeLabel");
    expect(speaking).not.toContain("Show model answer");
    expect(speaking).toContain("exercise.mode");
    expect(speaking).not.toContain("setSelectedMode");
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

  it("keeps reading written and inspectable while listening stays stored-TTS plus MCQ-only", () => {
    expect(reading).toContain("lesson.readingQuestions ?? []");
    expect(reading).toContain("<InspectableText");
    expect(reading).toContain("<textarea");
    expect(reading).not.toContain("MediaRecorder");
    expect(reading).not.toContain("/api/audio/transcribe");
    expect(audioControl).toContain('const readingSttOnly = label === "Hear this line"');
    expect(audioControl).toContain("if (readingSttOnly) return null");
    expect(listening).toContain("<AudioControl");
    expect(listening).toContain("onEnded={finishListening}");
    expect(listening).toContain("Listen to the complete conversation to unlock the answers.");
    expect(listening).toContain("disabled={!heardEntireConversation}");
    expect(listening).toContain("lockAfterAnswer");
    expect(listening).toContain("<MultipleChoiceCard");
    expect(listening).not.toContain("MediaRecorder");
    expect(listening).not.toContain("/api/audio/transcribe");
    expect(storedAudio).toContain('.from("lesson_listening_activities")');
    expect(storedAudio).not.toContain('.from("lesson_reading_sections")');
  });

  it("keeps the migrated speaking group and final review generation intact", () => {
    expect(runner).toContain("generateListeningAndSpeakingActivities");
    expect(runner).toContain("generateFinalReviewActivities");
    expect(validator).not.toContain("speakingExercises:");
    expect(validator).not.toContain("reviewQuestions:");
  });
});
