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
const canonicalMigration = readFileSync(
  "supabase/migrations/20260808120000_canonical_lesson_contract.sql",
  "utf8",
);
const vocabularyMigration = readFileSync(
  "supabase/migrations/20260805091000_skip_existing_story_vocabulary.sql",
  "utf8",
);

describe("generated lesson validation", () => {
  it("keeps story/library enrichment flexible but fixes learner activity counts", () => {
    expect(
      listeningQuestionIssues({
        questions: Array.from({ length: 5 }, () => ({})),
      }),
    ).toEqual([]);
    expect(
      speakingReadAloudIssues({
        sentences: [
          { difficulty: "easy" },
          { difficulty: "easy" },
          { difficulty: "medium" },
          { difficulty: "medium" },
          { difficulty: "hard" },
        ],
      }),
    ).toEqual([]);
    expect(
      storyEnrichmentOutputIssues({
        vocabulary: [{ word: "猫", reading: "ねこ", meaning: "cat" }],
      }),
    ).toEqual([]);

    expect(reading).toContain(
      "Reading response must contain exactly 5 questions.",
    );
    expect(activities).toContain(
      "Vocabulary response must contain exactly 13 questions.",
    );
    expect(activities).toContain(
      "Grammar response must contain exactly 10 questions.",
    );
    expect(activities).toContain(
      "Review response must contain exactly 5 questions.",
    );
    expect(activities).toContain(
      "const targets = storyTargets.length > 0 ? storyTargets : input.library.grammar",
    );
  });

  it("rejects incomplete fixed activity regions before storage", () => {
    expect(listeningQuestionIssues({ questions: [{}] })).not.toEqual([]);
    expect(speakingReadAloudIssues({ sentences: [{}] })).not.toEqual([]);
    expect(storyEnrichmentOutputIssues({ vocabulary: [] })).not.toEqual([]);

    // Preserve the historical reason PR #32 existed: target/story library
    // regions can remain variable. Plan 1 only restores exact learner banks.
    expect(flexiblePackageMigration).toContain(
      "Accepts variable generated lesson counts",
    );
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
    expect(vocabularyMigration).toContain(
      "'reusedVocabulary', v_linked - v_inserted",
    );
    expect(vocabularyMigration).not.toContain(
      "set source_payload = coalesce(public.vocabulary_records.source_payload",
    );
  });
});
