import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260817143000_level_scoped_mastery_profile.sql",
  ),
  "utf8",
);
const lessonTargets = readFileSync(
  join(process.cwd(), "lib/gemini/lesson-targets.ts"),
  "utf8",
);
const masteryEvidence = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260813113000_grammar_recognition_mastery.sql",
  ),
  "utf8",
);

describe("level-scoped learner mastery", () => {
  it("creates mastery rows for kanji and grammar through the learner JLPT ceiling", () => {
    expect(migration).toContain("from public.kanji_records record");
    expect(migration).toContain("from public.grammar_records record");
    expect(migration.match(/record\.jlpt_level <= p_level/g)?.length).toBe(2);
  });

  it("assumes untouched lower levels are 100 while the current level starts at 0", () => {
    expect(migration).toContain(
      "case when record.jlpt_level < p_level then 100 else 0 end",
    );
    expect(migration).toContain(
      "Lower untouched levels start at 100; the current level starts at 0",
    );
    expect(migration).toContain("recognition_score = excluded.recognition_score");
  });

  it("never overwrites scores once the learner has real evidence", () => {
    expect(
      migration.match(/where public\.learner_mastery\.evidence_count = 0;/g)?.length,
    ).toBe(2);
    expect(migration).toContain(
      "after insert or update of current_jlpt_level",
    );
  });

  it("keeps every lower JLPT level in the lesson target candidate scope", () => {
    expect(lessonTargets).toContain(
      "LEVELS.slice(0, LEVELS.indexOf(level) + 1)",
    );
    expect(lessonTargets).toContain('.in("jlpt_level", levels)');
  });

  it("uses 80 consistently as the learned/target-selection threshold", () => {
    expect(lessonTargets).toContain("const LEARNED_MASTERY_THRESHOLD = 80;");
    expect(lessonTargets).toContain(
      "mastery.mastery < LEARNED_MASTERY_THRESHOLD",
    );
    expect(lessonTargets).not.toContain("mastery.mastery < 75");
  });

  it("does not mistake an assumed 100 score for an unknown item", () => {
    expect(lessonTargets).not.toContain("mastery.evidenceCount === 0 ||");
    expect(lessonTargets).toContain(
      "weakKnown = Boolean(",
    );
    expect(lessonTargets).toContain(
      "mastery.evidenceCount > 0",
    );
  });

  it("treats assumed 100 lower-level kanji as known until mastery drops below 80", () => {
    expect(lessonTargets).toContain(
      "isKnown: Boolean(mastery && mastery.mastery >= LEARNED_MASTERY_THRESHOLD)",
    );
  });

  it("keeps normal mistake decay so crossing below 80 makes an item targetable", () => {
    expect(masteryEvidence).toContain(
      "when v_item_type = 'grammar' and v_signal = 'incorrect' then -6",
    );
    expect(masteryEvidence).toContain("when v_signal = 'incorrect' then -6");
    expect(lessonTargets).toContain(
      "weakKnown ? 0 : belowMasteryThreshold ? 1 : 2",
    );
  });
});
