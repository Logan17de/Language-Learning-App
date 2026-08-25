import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeStoryPassage } from "../lib/gemini/story-pipeline-v3";
import { CANONICAL_LESSON_PHASES } from "../lib/lesson-contract";

const storyCall = readFileSync("lib/gemini/adaptive-story-generation.ts", "utf8");
const storyContract = readFileSync("lib/gemini/story-generation-contract.ts", "utf8");
const simpleEnrichment = readFileSync("lib/gemini/simple-story-enrichment.ts", "utf8");
const curatedCatalog = readFileSync("lib/curated-vocabulary-catalog.ts", "utf8");
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
const curatedMigration = readFileSync(
  "supabase/migrations/20260813080000_curated_jlpt_vocabulary.sql",
  "utf8",
);

describe("custom lesson story pipeline v3", () => {
  it("makes the first model call story-only and treats selected targets as prompt guidance", () => {
    expect(storyContract).toContain("const STORY_MIN_SENTENCES = 10");
    expect(storyContract).toContain("const STORY_MAX_SENTENCES = 15");
    expect(storyContract).not.toContain('"selected_interest"');
    expect(storyContract.toLowerCase()).not.toContain("interest");
    expect(storyContract).toContain('"japanese_story"');
    expect(storyCall).toContain('name: "japanese_lesson"');
    expect(storyCall).toContain("strictSchema: true");
    expect(storyCall).toContain("exactSchemaName: true");
    expect(storyCall).toContain("validate: () => []");
    expect(storyCall).not.toContain("Story target validation failed");
    expect(storyCall).toContain("normalizeStoryPassage(result.value)");
    expect(plan).not.toContain('.from("user_preferences")');
    expect(plan.toLowerCase()).not.toContain("interest");
  });

  it("normalizes the story passage into the reader line", () => {
    const draft = normalizeStoryPassage({
      japanese_title: "東京の一日",
      english_title: "A Day in Tokyo",
      japanese_story: "朝、東京へ行きました。友達と駅で会いました。",
      english_translation: "I went to Tokyo in the morning. I met my friend at the station.",
    });
    expect(draft.title).toBe("A Day in Tokyo");
    expect(draft.japaneseTitle).toBe("東京の一日");
    expect(draft.tags).toEqual([]);
    expect(draft.lines[0]?.japanese).toContain("東京");
  });

  it("uses only curated JLPT compound CSVs to make the original story tappable", () => {
    expect(simpleEnrichment).toContain("lookupCuratedStoryVocabulary");
    expect(simpleEnrichment).toContain('CURATED_VOCABULARY_SOURCE_MODEL = "jlpt-curated-csv"');
    expect(simpleEnrichment).toContain("matchCuratedStoryVocabulary");
    expect(simpleEnrichment).toContain('rpc("store_story_vocabulary_enrichment"');
    expect(simpleEnrichment).not.toContain("lookup_jmdict_vocabulary");
    expect(curatedCatalog).toContain("Vocabs/jlpt_n5_compounds.csv");
    expect(curatedCatalog).toContain("Vocabs/jlpt_n1_compounds.csv");
    expect(curatedCatalog).toContain("right.end - right.start");
    expect(existingLibrary).toContain('CURATED_SOURCE_MODEL = "jlpt-curated-csv"');
    expect(existingLibrary).toContain('from("story_vocabulary_enrichments")');
    expect(existingLibrary).toContain("matchCuratedStoryVocabularyOccurrences");
    expect(existingLibrary).not.toContain("composeEntryForm");
    expect(curatedMigration).toContain("drop table if exists public.jmdict_entries cascade");
  });

  it("keeps every non-overlapping library occurrence before deduplicating storage", () => {
    expect(curatedCatalog).toContain("matchCuratedStoryVocabularyOccurrences");
    expect(curatedCatalog).toContain("return selected;");
    expect(existingLibrary).toContain("for (const match of matchCuratedStoryVocabularyOccurrences");
  });

  it("does not perform a second kanji or grammar enrichment pass", () => {
    expect(placeholderEnrichment).toContain('model: "catalog-identities-only"');
    expect(placeholderEnrichment).not.toContain("generateStructured");
    expect(targetIdentityMigration).toContain("lessonTargetIdentityOnly");
  });

  it("builds seven vocabulary and kanji questions with targets as guidance", () => {
    expect(vocabularyContract).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(vocabularyContract).toContain("not a question whitelist");
    expect(activityGroups).toContain('name: "vocab_questions"');
    expect(activityGroups).not.toContain("does not practice target kanji");
  });

  it("builds seven grammar questions without target-whitelist rejection", () => {
    expect(grammarContract).toContain("Create exactly 7 questions: 3 easy, 2 medium, and 2 hard.");
    expect(grammarContract).toContain("guidance rather than a whitelist");
    expect(activityGroups).not.toContain("does not practice one of the selected grammar patterns");
  });

  it("generates five reading MCQs without later vocabulary indexing", () => {
    expect(readingContract).toContain("Create exactly 5 questions: 2 easy, 2 medium, and 1 hard.");
    expect(readingContract).toContain("exactly four distinct choices");
    expect(readingGeneration).not.toContain("lookupJapaneseDictionaryVocabulary");
    expect(readingGeneration).toContain("inspectableTerms: []");
    expect(readingGeneration.toLowerCase()).not.toContain("interest");
    expect(reading).toContain("question?.choices");
  });

  it("creates five listening and five speaking exercises without later vocabulary passes", () => {
    expect(listeningContract).toContain("Create exactly 5 listening-comprehension questions");
    expect(speakingContract).toContain("Create exactly 5 Japanese sentences for read-aloud speaking practice");
    expect(listeningGeneration).not.toContain("storeGeneratedVocabularyTerms");
    expect(speakingGeneration).not.toContain("storeGeneratedVocabularyTerms");
    expect(listeningGeneration).toContain("inspectableTerms: []");
    expect(speakingGeneration).toContain("inspectableTerms: []");
  });

  it("keeps only three durable activity checkpoints and no review", () => {
    expect(checkpoints).toContain('"vocabulary_and_kanji"');
    expect(checkpoints).toContain('"grammar_and_reading"');
    expect(checkpoints).toContain('"listening_and_speaking"');
    expect(checkpoints).not.toContain('| "final_review"');
    expect(runner).toContain("invalidate_progressive_lesson_group");
  });

  it("keeps target readings hidden until inspection and tracks kanji exposure", () => {
    expect(inspectable).not.toContain("［{segment.word.reading}］");
    expect(inspectable).toContain('active.word.scriptType === "kanji" && stage >= 1');
    expect(runner).toContain('rpc("record_story_kanji_exposures_background"');
    expect(exposureMigration).toContain("appearance_count >= 10");
  });

  it("uses six sections with no Translation split and no final review", () => {
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
    expect(progressiveStory).toContain("English translation");
    expect(storyPhase).toContain("English translation");
    expect(listening).toContain("<AudioControl");
    expect(speaking).toContain("Read the sentence aloud");
  });

  it("keeps listening audio non-blocking", () => {
    expect(storedAudio).toContain('.from("lesson_listening_activities")');
    expect(runner).toContain('last_action: "audio_non_blocking_failure"');
  });

  it("uses the stateless OpenAI structured generation path with bounded retries", () => {
    expect(structured).toContain("OPENAI_API_KEY");
    expect(structured).toContain("OPENAI_STORY_MODEL");
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_MAX_CONCURRENCY");
    expect(compatibilityExport).toContain("OPENAI_STRUCTURED_RETRIES");
  });
});
