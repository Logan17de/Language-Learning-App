import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listeningQuestionIssues } from "../lib/gemini/listening-question-contract";
import { speakingReadAloudIssues } from "../lib/gemini/speaking-question-contract";

const activities = readFileSync("lib/gemini/lesson-activity-groups.ts", "utf8");
const storyEnrichment = readFileSync("lib/gemini/simple-story-enrichment.ts", "utf8");
const reading = readFileSync("lib/gemini/reading-region-generation.ts", "utf8");
const listening = readFileSync("lib/gemini/listening-region-generation.ts", "utf8");
const speaking = readFileSync("lib/gemini/speaking-region-generation.ts", "utf8");
const vocabularyContract = readFileSync("lib/gemini/vocabulary-question-contract.ts", "utf8");
const grammarContract = readFileSync("lib/gemini/grammar-question-contract.ts", "utf8");
const flexiblePackageMigration = readFileSync(
  "supabase/migrations/20260805090000_flexible_generated_lesson_validation.sql",
  "utf8",
);
const canonicalMigration = readFileSync(
  "supabase/migrations/20260808120000_canonical_lesson_contract.sql",
  "utf8",
);
const vocabularyMigration = readFileSync(
  "supabase/migrations/20260805091000_skip_existing_story_vocabulary.sql",
  "utf8",
);

describe("generated lesson validation", () => {
  it("keeps the original story dictionary pass while fixing learner activity banks", () => {
    expect(listeningQuestionIssues({
      questions: [
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "medium" },
        { difficulty: "medium" },
        { difficulty: "hard" },
        { difficulty: "hard" },
      ],
    })).toEqual([]);
    expect(speakingReadAloudIssues({
      sentences: [
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "easy" },
        { difficulty: "medium" },
        { difficulty: "medium" },
        { difficulty: "hard" },
        { difficulty: "hard" },
      ],
    })).toEqual([]);
    expect(storyEnrichment).toContain('DICTIONARY_SOURCE_MODEL = "jmdict-local"');
    expect(storyEnrichment).toContain("lookupJapaneseDictionaryVocabulary");
    expect(storyEnrichment).not.toContain("generateStructured");

    expect(reading).toContain("Reading response must contain exactly 7 questions.");
    expect(activities).toContain("Vocabulary response must contain exactly 7 questions.");
    expect(activities).toContain("Grammar response must contain exactly 7 questions.");
    expect(activities).not.toContain("does not practice one of the selected grammar patterns");
    expect(activities).not.toContain("does not practice target kanji");
    expect(activities).toContain("Review response must contain exactly 5 questions.");
    expect(activities).toContain("strictSchema: true");
    expect(activities).toContain("exactSchemaName: true");
    expect(activities).toContain(
      "const targets = storyTargets.length === 3 ? storyTargets : targetGrammarRecords(input.library)",
    );
    expect(vocabularyContract).toContain("kanjiTeaching");
    expect(vocabularyContract).toContain("not a question whitelist");
    expect(grammarContract).toContain("grammarTeaching");
    expect(grammarContract).toContain("not a question whitelist");
  });

  it("keeps JMdict limited to the original story", () => {
    for (const source of [reading, listening, speaking]) {
      expect(source).not.toContain("lookupJapaneseDictionaryVocabulary");
      expect(source).not.toContain("storeGeneratedVocabularyTerms");
      expect(source).not.toContain("DICTIONARY_SOURCE_MODEL");
    }
    expect(reading).toContain("inspectableTerms: []");
    expect(listening).toContain("inspectableTerms: []");
    expect(speaking).toContain("inspectableTerms: []");
  });

  it("rejects incomplete fixed activity regions before storage", () => {
    expect(listeningQuestionIssues({ questions: [{}] })).not.toEqual([]);
    expect(speakingReadAloudIssues({ sentences: [{}] })).not.toEqual([]);

    expect(flexiblePackageMigration).toContain("Accepts variable generated lesson counts");
    expect(canonicalMigration).toContain(
      "jsonb_array_length(p_package->'vocabularyQuestions') <> 13",
    );
    expect(canonicalMigration).toContain(
      "jsonb_array_length(p_package->'grammarQuestions') <> 10",
    );
    expect(canonicalMigration).toContain(
      "jsonb_array_length(p_package->'readingQuestions') <> 5",
    );
  });

  it("reuses an existing raw word and inserts only when it is absent", () => {
    expect(vocabularyMigration).toContain("record.written_form = v_word");
    expect(vocabularyMigration).toContain("record.reading = v_reading");
    expect(vocabularyMigration).toContain("if v_vocabulary_id is null then");
    expect(vocabularyMigration).toContain("'reusedVocabulary', v_linked - v_inserted");
    expect(vocabularyMigration).not.toContain(
      "set source_payload = coalesce(public.vocabulary_records.source_payload",
    );
  });
});
