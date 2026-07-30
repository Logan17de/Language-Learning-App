import {
  PARTS_OF_SPEECH,
  VERB_TYPES,
  containsKanji,
  containsPunctuationOrSpace,
  lookupSurface,
  normalizeJapanese,
  type LexiconEntry,
  type PartOfSpeech,
  type VerbType,
} from "@/lib/japanese-lexicon";
import type { DraftTerm } from "@/lib/gemini/lesson-engine-v2";

export interface LexicalDraftTerm extends DraftTerm {
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: string;
  conjugationType: string;
  dictionaryAlias: string;
}

export const STORY_CONTENT_PARTS = PARTS_OF_SPEECH.filter(
  (part) => part !== "particle" && part !== "auxiliary",
);

function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return (
    typeof value === "string" &&
    (PARTS_OF_SPEECH as readonly string[]).includes(value)
  );
}

function isVerbType(value: unknown): value is VerbType {
  return (
    typeof value === "string" &&
    (VERB_TYPES as readonly string[]).includes(value)
  );
}

function isKana(value: string): boolean {
  return /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u.test(value);
}

function termSummary(input: {
  surface: string;
  observedReading: string;
  dictionaryForm: string;
  dictionaryReading: string;
  partOfSpeech: unknown;
  conjugationType: unknown;
  alias: string;
}): string {
  return JSON.stringify({
    surface: input.surface,
    readingHint: input.observedReading,
    dictionaryForm: input.dictionaryForm,
    dictionaryReading: input.dictionaryReading,
    partOfSpeech: input.partOfSpeech,
    conjugationType: input.conjugationType,
    dictionaryAlias: input.alias,
  });
}

/**
 * Validates one lexical term against the deterministic conjugation engine.
 *
 * Gemini occasionally returns the dictionary-form reading in `readingHint`
 * even when the written surface is correctly inflected. When the exact
 * canonical/alias spelling produces one unambiguous kana surface, the server
 * replaces only that observed reading with the deterministic value. No lemma,
 * alias, part of speech, conjugation class, or written surface is corrected
 * automatically.
 */
export function lexicalTermIssues(term: DraftTerm, label: string): string[] {
  const lexical = term as Partial<LexicalDraftTerm>;
  const surface = normalizeJapanese(term.surface);
  const observedReading = normalizeJapanese(term.readingHint);
  const dictionaryForm = normalizeJapanese(lexical.dictionaryForm);
  const dictionaryReading = normalizeJapanese(lexical.dictionaryReading);
  const alias = normalizeJapanese(lexical.dictionaryAlias);
  const issues: string[] = [];

  if (!surface || containsPunctuationOrSpace(surface)) {
    issues.push(`${label} needs a punctuation-free lexical surface.`);
  }
  if (!observedReading || !isKana(observedReading)) {
    issues.push(`${label} readingHint must be the kana reading of the observed surface.`);
  }
  if (!dictionaryForm || containsPunctuationOrSpace(dictionaryForm)) {
    issues.push(`${label} needs a valid dictionary form.`);
  }
  if (!dictionaryReading || !isKana(dictionaryReading)) {
    issues.push(`${label} dictionaryReading must be the dictionary-form kana.`);
  }
  if (alias && containsPunctuationOrSpace(alias)) {
    issues.push(`${label} dictionaryAlias contains invalid punctuation or spacing.`);
  }
  if (!isPartOfSpeech(lexical.partOfSpeech)) {
    issues.push(`${label} needs a supported part of speech.`);
  } else if (lexical.partOfSpeech === "particle" || lexical.partOfSpeech === "auxiliary") {
    issues.push(`${label} cannot store a particle or auxiliary as vocabulary.`);
  }

  const conjugationType = isVerbType(lexical.conjugationType)
    ? lexical.conjugationType
    : undefined;
  if (lexical.partOfSpeech === "verb" && !conjugationType) {
    issues.push(`${label} verb needs a supported conjugation type.`);
  }
  if (lexical.partOfSpeech !== "verb" && normalizeJapanese(lexical.conjugationType)) {
    issues.push(`${label} non-verb must use an empty conjugationType.`);
  }
  if (alias && alias === dictionaryForm) {
    issues.push(`${label} dictionaryAlias must be empty when it equals the canonical form.`);
  }

  if (issues.length > 0 || !isPartOfSpeech(lexical.partOfSpeech)) {
    return issues;
  }

  const preview: LexiconEntry = {
    id: `story-${label}`,
    kanji: containsKanji(dictionaryForm) ? dictionaryForm : "",
    kana: dictionaryReading,
    meaning: "pending enrichment",
    partOfSpeech: lexical.partOfSpeech,
    ...(conjugationType ? { conjugationType } : {}),
    aliases: alias ? [alias] : [],
    source: "gemini",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };

  const surfaceCandidates = lookupSurface([preview], surface).filter(
    (candidate) =>
      alias
        ? candidate.matchedThroughAlias && candidate.matchedSpelling === alias
        : !candidate.matchedThroughAlias,
  );

  if (surfaceCandidates.length < 1) {
    issues.push(
      `${label} written surface cannot be recomposed from its exact canonical or alias spelling. ` +
      `Correct the dictionary form, part of speech, conjugation type, alias, or lexical boundary; do not store an inflected form as the lemma. ` +
      `Term: ${termSummary({
        surface,
        observedReading,
        dictionaryForm,
        dictionaryReading,
        partOfSpeech: lexical.partOfSpeech,
        conjugationType: lexical.conjugationType,
        alias,
      })}`,
    );
    return issues;
  }

  const expectedReadings = [...new Set(
    surfaceCandidates
      .map((candidate) => normalizeJapanese(candidate.form.kana))
      .filter(Boolean),
  )];

  if (!expectedReadings.includes(observedReading)) {
    if (expectedReadings.length === 1) {
      // This is a deterministic correction derived from the exact canonical or
      // alias entry and the accepted ordered transformation chain.
      term.readingHint = expectedReadings[0];
    } else {
      issues.push(
        `${label} readingHint ${JSON.stringify(observedReading)} does not match the observed surface. ` +
        `Expected one of ${JSON.stringify(expectedReadings)}. ` +
        `Term: ${termSummary({
          surface,
          observedReading,
          dictionaryForm,
          dictionaryReading,
          partOfSpeech: lexical.partOfSpeech,
          conjugationType: lexical.conjugationType,
          alias,
        })}`,
      );
    }
  }

  return issues;
}
