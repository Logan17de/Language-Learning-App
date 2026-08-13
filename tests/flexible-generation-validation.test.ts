import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listeningQuestionIssues } from "../lib/gemini/listening-question-contract";
import { speakingReadAloudIssues } from "../lib/gemini/speaking-question-contract";

const activities = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");
const checkpoints = readFileSync("lib/custom-lessons/checkpoint-validation.ts", "utf8");
const storyEnrichment = readFileSync("lib/gemini/simple-story-enrichment.ts", "utf8");
const curatedCatalog = readFileSync("lib/curated-vocabulary-catalog.ts", "utf8");
const reading = readFileSync("lib/gemini/reading-region-generation.ts", "utf8");
const listening = readFileSync("lib/gemini/listening-region-generation.ts", "utf8");
const speaking = readFileSync("lib/gemini/speaking-region-generation.ts", "utf8");
const vocabularyContract = readFileSync("lib/gemini/vocabulary-question-contract.ts", "utf8");
const grammarContract = readFileSync("lib/gemini/grammar-question-contract.ts", "utf8");
const currentPackageMigration = readFileSync(
  "supabase/migrations/20260813070000_reading_mcq_choices.sql",
  "utf8",
);
const curatedMigration = readFileSync(
  "supabase/migrations/20260813080000_curated_jlpt_vocabulary.sql",
  "utf8",
);

describe("generated lesson validation", () => {
  it("uses curated story vocabulary while keeping learner activity validation structural", () => {
    expect(listeningQuestionIssues({
      questions: [
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "medium" },
        { difficulty: "medium" },
        { difficulty: "hard" },
      ],
    })).toEqual([]);
    expect(speakingReadAloudIssues({
      sentences: [
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "medium" },
        { difficulty: "medium" },
        { difficulty: "hard" },
      ],
    })).toEqual([]);
    expect(storyEnrichment).toContain('CURATED_VOCABULARY_SOURCE_MODEL = "jlpt-curated-csv"');
    expect(storyEnrichment).toContain("matchCuratedStoryVocabulary");
    expect(storyEnrichment).not.toContain("lookup_jmdict_vocabulary");
    expect(curatedCatalog).toContain("Vocabs/jlpt_n5_compounds.csv");
    expect(storyEnrichment).not.toContain("generateStructured");

    expect(reading).toContain("Reading response must contain exactly 5 questions.");
    expect(activities).toContain("Vocabulary response must contain exactly 7 questions.");
    expect(activities).toContain("Grammar response must contain exactly 7 questions.");
    expect(activities).not.toContain("does not practice one of the selected grammar patterns");
    expect(activities).not.toContain("does not practice target kanji");
    expect(checkpoints).not.toContain('| "final_review"');
    expect(activities).toContain("strictSchema: true");
    expect(activities).toContain("exactSchemaName: true");
    expect(vocabularyContract).toContain("kanjiTeaching");
    expect(vocabularyContract).toContain("not a question whitelist");
    expect(grammarContract).toContain("grammarTeaching");
    expect(grammarContract).toContain("not a question whitelist");
  });

  it("does not perform vocabulary lookup for reading, listening, or speaking", () => {
    for (const source of [reading, listening, speaking]) {
      expect(source).not.toContain("lookupJapaneseDictionaryVocabulary");
      expect(source).not.toContain("storeGeneratedVocabularyTerms");
      expect(source).not.toContain("CURATED_VOCABULARY_SOURCE_MODEL");
    }
    expect(reading).toContain("inspectableTerms: []");
    expect(listening).toContain("inspectableTerms: []");
    expect(speaking).toContain("inspectableTerms: []");
  });

  it("rejects incomplete fixed activity regions before storage", () => {
    expect(listeningQuestionIssues({ questions: [{}] })).not.toEqual([]);
    expect(speakingReadAloudIssues({ sentences: [{}] })).not.toEqual([]);

    expect(currentPackageMigration).toContain("vocabularyQuestions must contain exactly 7 items");
    expect(currentPackageMigration).toContain("grammarQuestions must contain exactly 7 items");
    expect(currentPackageMigration).toContain("readingQuestions must contain exactly 5 items");
    expect(currentPackageMigration).toContain("listeningExercises must contain exactly 5 items");
    expect(currentPackageMigration).toContain("speakingExercises must contain exactly 5 items");
    expect(currentPackageMigration).toContain("reviewQuestions must be empty");
  });

  it("upserts curated rows and retires the dedicated JMdict cache", () => {
    expect(curatedMigration).toContain("on conflict (written_form, reading, meaning) do update");
    expect(curatedMigration).toContain("source_model = excluded.source_model");
    expect(curatedMigration).toContain("drop function if exists public.lookup_jmdict_vocabulary");
    expect(curatedMigration).toContain("drop table if exists public.jmdict_entries cascade");
    expect(curatedMigration).toContain("vocabulary must be an array");
  });
});
