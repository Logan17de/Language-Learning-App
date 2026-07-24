import type { ValidationCheck, ValidationSeverity } from "@/types/admin";

const definitions = [
  ["schema_required", "Schema", "Required fields present"],
  ["schema_structure", "Schema", "Valid activity structure"],
  ["schema_answers", "Schema", "Answer keys present"],
  ["schema_ids", "Schema", "IDs are unique"],
  ["schema_phases", "Schema", "No required phase is empty"],
  ["curriculum_level", "Curriculum", "Level is appropriate"],
  ["curriculum_grammar", "Curriculum", "Selected grammar is included"],
  ["curriculum_kanji", "Curriculum", "Selected kanji is included"],
  ["curriculum_vocabulary", "Curriculum", "Vocabulary difficulty is appropriate"],
  ["curriculum_prerequisites", "Curriculum", "Prerequisites are respected"],
  ["alignment_story", "Content alignment", "Story matches the requested topic"],
  ["alignment_vocabulary", "Content alignment", "Vocabulary originates from the story"],
  ["alignment_grammar", "Content alignment", "Grammar originates from the story"],
  ["alignment_reading", "Content alignment", "Reading uses lesson content"],
  ["alignment_listening", "Content alignment", "Listening uses lesson content"],
  ["alignment_speaking", "Content alignment", "Speaking uses lesson content"],
  ["alignment_review", "Content alignment", "Final review covers lesson content"],
  ["question_unique", "Question quality", "Only one answer is correct"],
  ["question_distractors", "Question quality", "Distractors are plausible"],
  ["question_duplicates", "Question quality", "Options are not duplicated"],
  ["question_explanations", "Question quality", "Explanations match answers"],
  ["question_ambiguity", "Question quality", "Questions are unambiguous"],
  ["language_natural", "Language quality", "Japanese is natural"],
  ["language_translation", "Language quality", "Translations are accurate"],
  ["language_grammar", "Language quality", "Grammar is correct"],
  ["language_reading", "Language quality", "Readings are correct"],
  ["language_register", "Language quality", "Polite and casual registers are consistent"],
  ["safety_content", "Safety and quality", "No inappropriate content"],
  ["safety_personal", "Safety and quality", "No personal data"],
  ["safety_instructions", "Safety and quality", "No unsafe instructions"],
  ["safety_stereotypes", "Safety and quality", "No stereotypes"],
  ["safety_copyright", "Safety and quality", "No copied-content signal"],
  ["safety_claims", "Safety and quality", "No unsupported claims"],
] as const;

export function buildValidationChecks(
  overrides: Partial<Record<string, ValidationSeverity>> = {},
): ValidationCheck[] {
  return definitions.map(([id, category, label]) => {
    const severity = overrides[id] ?? "passed";
    return {
      id,
      category,
      label,
      severity,
      detail: severity === "passed"
        ? "Deterministic check passed."
        : severity === "warning"
          ? "Human confirmation recommended."
          : "Required correction before publishing.",
    };
  });
}
