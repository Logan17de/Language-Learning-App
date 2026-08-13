import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeStoryPassage } from "../lib/gemini/story-pipeline-v3";
import { CANONICAL_LESSON_PHASES } from "../lib/lesson-contract";

const storyCall = readFileSync("lib/gemini/adaptive-story-generation.ts", "utf8");
const storyContract = readFileSync("lib/gemini/story-generation-contract.ts", "utf8");
const simpleEnrichment = readFileSync("lib/gemini/simple-story-enrichment.ts", "utf8");
const existingLibrary = readFileSync("lib/gemini/story-library-existing-only.ts", "utf8");
const placeholderEnrichment = readFileSync("lib/custom-lessons/placeholder-enrichment.ts", "utf8");
const plan = readFileSync("lib/gemini/lesson-plan-v3.ts", "utf8");
const runner = readFileSync("lib/custom-lessons/job-runner.ts", "utf8");
const checkpoints = readFileSync("lib/custom-lessons/checkpoint-validation.ts", "utf8");
const activityGroups = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");
const vocabularyContract = readFileSync("lib/gemini/vocabulary-question-contract.ts", "utf8");
const grammarContract = readFileSync("lib/gemini/grammar-question-contract.ts", "utf8");
const readingContract = readFileSync("lib/gemini/reading-comprehension-contract.ts", "utf8");
const readingGeneration = readFileSync("lib/gemini/reading-region-generation.ts", "utf8");
const listeningContract = readFileSync("lib/gemini/listening-question-contract.ts", "utf8");
const listeningGeneration = readFileSync("lib/gemini/listening-region-generation.ts", "utf8");
const speakingContract = readFileSync("lib/gemini/speaking-question-contract.ts", "utf8");
const speakingGeneration = readFileSync("lib/gemini/speaking-region-generation.ts", "utf8");
const structured = readFileSync("lib/openai/structured-output.ts", "utf8");
const compatibilityExport = readFileSync("lib/gemini/structured-output.ts", "utf8");
const inspectable = readFileSync("components/exercises/inspectable-text.tsx", "utf8");
const progressiveStory = readFileSync("components/lesson/progressive-story-page.tsx", "utf8");
const storyPhase = readFileSync("components/lesson/story-phase.tsx", "utf8");
const reading = readFileSync("components/lesson/reading-phase.tsx", "utf8");
const listening = readFileSync("components/lesson/listening-phase.tsx", "utf8");
const speaking = readFileSync("components/lesson/speaking-phase.tsx", "utf8");
const storedAudio = readFileSync("lib/audio/audio-library.ts", "utf8");
const exposureMigration = readFileSync(
  "supabase/migrations/20260730070000_story_pipeline_and_kanji_exposure.sql",
  "utf8",
);
const targetIdentityMigration = readFileSync(
  "supabase/migrations/20260812180000_catalog_identity_only_lesson_targets.sql",
  "utf8",
);

describe("custom lesson story pipeline v3", () => {
  it("makes the first model call story-only and treats selected targets as prompt guidance", () => {
    expect(storyContract).toContain("const STORY_MIN_SENTENCES = 10");
    expect(storyContract).toContain("const STORY_MAX_SENTENCES = 15");
    expect(storyContract).toContain('"selected_interest"');
    expect(storyContract).toContain('"japanese_story"');
    expect(storyContract).toContain('"english_translation"');
    expect(storyContract).toContain("one continuous string, not an array");
    expect(storyCall).toContain('name: "japanese_lesson"');
    expect(storyCall).toContain("strictSchema: true");
    expect(storyCall).toContain("exactSchemaName: true");
    expect(storyCall).toContain("validate: () => []");
    expect(storyCall).not.toContain("missingKanji");
    expect(storyCall).not.toContain("missingGrammar");
    expect(storyCall).not.toContain("Story target validation failed");
    expect(storyCall).not.toContain("storyUsesGrammarPattern");
    expect(storyCall).toContain("normalizeStoryPassage(result.value)");
    expect(plan).toContain('.from("user_preferences")');
    expect(plan).toContain('.from("profiles")');
  });

  it("normalizes the story passage into the backward-compatible reader line", () => {
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

  it("uses local JMdict only to make the original story tappable", () => {
    expect(simpleEnrichment).toContain("lookupJapaneseDictionaryVocabulary");
    expect(simpleEnrichment).toContain('DICTIONARY_SOURCE_MODEL = "jmdict-local"');
    expect(simpleEnrichment).toContain('rpc("lookup_jmdict_vocabulary"');
    expect(simpleEnrichment).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(simpleEnrichment).not.toContain("generateStructured");
    expect(existingLibrary).toContain("resolveStoryFromExistingLibrary");
    expect(existingLibrary).toContain("buildFormIndex");
    expect(existingLibrary).toContain("composeEntryForm");
    expect(existingLibrary).toContain("Story words become tappable");
    expect(existingLibrary).not.toContain("generateStructured");
    expect(runner).toContain("enrichGeneratedStoryVocabulary");
    expect(runner.indexOf("processVocabularyEnrichment")).toBeLessThan(
      runner.indexOf("processLibraryResolution"),
    );
  });

  it("does not perform a second kanji or grammar enrichment pass", () => {
    expect(placeholderEnrichment).toContain('model: "catalog-identities-only"');
    expect(placeholderEnrichment).not.toContain("generateStructured");
    expect(placeholderEnrichment).not.toContain("enrich_custom_lesson_placeholders_background");
    expect(targetIdentityMigration).toContain("lessonTargetIdentityOnly");
    expect(targetIdentityMigration).toContain("teachingMetadataRequired");
  });

  it("builds seven vocabulary and kanji questions from story plus five target teaching identities", () => {
    expect(vocabularyContract).toContain("Create AIko's vocabulary and kanji lesson from this fixed Japanese story.");
    expect(vocabularyContract).toContain("kanjiTeaching");
    expect(vocabularyContract).toContain("not a question whitelist");
    expect(vocabularyContract).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(activityGroups).toContain('name: "vocab_questions"');
    expect(activityGroups).toContain("adaptKanjiTeaching");
    expect(activityGroups).toContain("adaptVocabularyQuestions");
    expect(activityGroups).toContain("targetKanjiCharacters(input.library)");
    expect(activityGroups).not.toContain("does not practice target kanji");
    expect(activityGroups).not.toContain("inputLibraryVocabularyMatch");
  });

  it("builds grammar teaching plus seven questions without target-whitelist rejection", () => {
    expect(grammarContract).toContain("Create AIko's grammar lesson from this fixed Japanese story.");
    expect(grammarContract).toContain("grammarTeaching");
    expect(grammarContract).toContain("meaning, formation, usage");
    expect(grammarContract).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(grammarContract).toContain("guidance rather than a whitelist");
    expect(activityGroups).toContain('name: "grammar_questions"');
    expect(activityGroups).toContain("adaptGrammarTeaching");
    expect(activityGroups).toContain("targetGrammarRecords(input.library)");
    expect(activityGroups).not.toContain("does not practice one of the selected grammar patterns");
  });

  it("generates reading passage and five MCQs without dictionary indexing", () => {
    expect(readingContract).toContain("Create reading-comprehension multiple-choice questions");
    expect(readingContract).toContain("Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.");
    expect(readingContract).toContain("exactly four distinct choices");
    expect(readingGeneration).toContain('name: "reading_lesson"');
    expect(readingGeneration).toContain('name: "reading_questions"');
    expect(readingGeneration).not.toContain("lookupJapaneseDictionaryVocabulary");
    expect(readingGeneration).not.toContain("storeGeneratedVocabularyTerms");
    expect(readingGeneration).toContain("inspectableTerms: []");
    expect(reading).toContain("question?.choices");
  });

  it("creates five listening exercises without a vocabulary enrichment pass", () => {
    expect(listeningContract).toContain("Create exactly 5 listening-comprehension questions");
    expect(listeningContract).toContain("2 easy, 2 medium, and 1 hard");
    expect(listeningGeneration).toContain('name: "listening_questions"');
    expect(listeningGeneration).toContain("strictSchema: true");
    expect(listeningGeneration).not.toContain("lookupJapaneseDictionaryVocabulary");
    expect(listeningGeneration).not.toContain("storeGeneratedVocabularyTerms");
    expect(listeningGeneration).toContain("targetItemIds: []");
    expect(listeningGeneration).toContain("inspectableTerms: []");
  });

  it("creates five story-grounded read-aloud exercises without dictionary indexing", () => {
    expect(speakingContract).toContain("Create exactly 5 Japanese sentences for read-aloud speaking practice");
    expect(speakingContract).toContain("2 easy, 2 medium, and 1 hard");
    expect(speakingGeneration).toContain('name: "speaking_read_aloud"');
    expect(speakingGeneration).toContain("strictSchema: true");
    expect(speakingGeneration).not.toContain("lookupJapaneseDictionaryVocabulary");
    expect(speakingGeneration).not.toContain("storeGeneratedVocabularyTerms");
    expect(speakingGeneration).toContain("targetItemIds: []");
    expect(speakingGeneration).toContain("inspectableTerms: []");
  });

  it("assembles later lesson stages with no tappable vocabulary outside the original story", () => {
    expect(activityGroups).toContain("withNoTappableTerms");
    expect(activityGroups).toContain("inspectableTerms: [] as InspectableTerm[]");
    expect(activityGroups).toContain("kanji: input.groups.vocabularyAndKanji.kanjiTeaching");
    expect(activityGroups).toContain("grammar: input.groups.grammarAndReading.grammarTeaching");
    expect(activityGroups).toContain("story: playableStoryLines(input.draft, input.library)");
    expect(activityGroups).toContain("shuffledChoices(");
  });

  it("keeps durable checkpoints, drops final review, and regenerates only invalid groups", () => {
    expect(checkpoints).toContain('"vocabulary_and_kanji"');
    expect(checkpoints).toContain('"grammar_and_reading"');
    expect(checkpoints).toContain('"listening_and_speaking"');
    expect(checkpoints).not.toContain('| "final_review"');
    expect(runner).toContain("normalizeGeneratedCheckpoint(generated.value)");
    expect(runner).toContain("await persistGroup(admin, current, group, normalized, generated.audit)");
    expect(runner).toContain("invalidate_progressive_lesson_group");
    expect(runner).toContain('last_action: "invalidated_checkpoint"');
    expect(runner).toContain("finalizationFailureAction(error)");
  });

  it("keeps target readings hidden until inspection and tracks kanji exposure", () => {
    expect(inspectable).not.toContain("［{segment.word.reading}］");
    expect(inspectable).toContain('active.word.scriptType === "kanji" && stage >= 1');
    expect(runner).toContain('rpc("record_story_kanji_exposures_background"');
    expect(exposureMigration).toContain("appearance_count >= 10");
    expect(exposureMigration).toContain("knownThreshold', 10");
  });

  it("uses the six-phase learner order with no final review", () => {
    expect(CANONICAL_LESSON_PHASES.map((phase) => phase.id)).toEqual([
      "story",
      "vocabulary",
      "grammar",
      "reading",
      "listening",
      "speaking",
    ]);
    expect(progressiveStory).toContain("japanesePassage");
    expect(progressiveStory).toContain("englishPassage");
    expect(storyPhase).toContain("English story");
    expect(reading).toContain("lesson.readingQuestions ?? []");
    expect(listening).toContain("<AudioControl");
    expect(speaking).toContain("Read the sentence aloud");
  });

  it("keeps listening audio stored while audio failure remains non-blocking", () => {
    expect(storedAudio).toContain('.from("lesson_listening_activities")');
    expect(runner).toContain('last_action: "audio_non_blocking_failure"');
    expect(runner).toContain('audio_status: "failed"');
  });

  it("uses the stateless OpenAI structured generation path with bounded retries", () => {
    expect(structured).toContain("OPENAI_API_KEY");
    expect(structured).toContain("OPENAI_STORY_MODEL");
    expect(structured).toContain("OpenAI structured generation completed");
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_MAX_CONCURRENCY");
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_RETRIES");
    expect(compatibilityExport).toContain("Retrying transient OpenAI structured generation");
  });
});
