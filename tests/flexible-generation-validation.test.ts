import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listeningQuestionIssues } from "../lib/gemini/listening-question-contract";
import { speakingReadAloudIssues } from "../lib/gemini/speaking-question-contract";
import { storyEnrichmentOutputIssues } from "../lib/gemini/simple-story-enrichment-contract";

const activities = readFileSync(
  "lib/gemini/lesson-activity-groups.ts",
  "utf8",
);
const reading = readFileSync(
  "lib/gemini/reading-region-generation.ts",
  "utf8",
);
const flexiblePackageMigration = readFileSync(
  "supabase/migrations/20260805090000_flexible_generated_lesson_validation.sql",
  "utf8",
);
const vocabularyMigration = readFileSync(
  "supabase/migrations/20260805091000_skip_existing_story_vocabulary.sql",
  "utf8",
);

describe("flexible generated lesson validation", () => {
  it("accepts populated model regions without semantic recounting", () => {
    expect(listeningQuestionIssues({ questions: [{}] })).toEqual([]);
    expect(speakingReadAloudIssues({ sentences: [{}] })).toEqual([]);
    expect(storyEnrichmentOutputIssues({
      vocabulary: [{ word: "猫", reading: "ねこ", meaning: "cat" }],
    })).toEqual([]);
    expect(reading).toContain(
      "Reading response must contain at least one question.",
    );
    expect(activities).toContain(
      "Review response must contain at least one question.",
    );
    expect(activities).toContain(
      "const targets = storyTargets.length > 0 ? storyTargets : input.library.grammar",
    );
  });

  it("requests a retry only for empty generated regions", () => {
    expect(listeningQuestionIssues({ questions: [] })).not.toEqual([]);
    expect(speakingReadAloudIssues({ sentences: [] })).not.toEqual([]);
    expect(storyEnrichmentOutputIssues({ vocabulary: [] })).not.toEqual([]);
    expect(flexiblePackageMigration).toContain(
      "jsonb_array_length(p_package->v_key) = 0",
    );
    expect(flexiblePackageMigration).toContain(
      "Accepts variable generated lesson counts",
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
