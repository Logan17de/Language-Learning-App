import type { StoryWord } from "@/types/lesson";

const JAPANESE_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function normalized(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase();
}

/**
 * Question help is useful for a Japanese context sentence, but not for a
 * standalone word or grammar pattern that is itself the thing being tested.
 */
export function questionAllowsTappableWords(cue: string): boolean {
  const compact = cue.replace(/\s+/gu, "").trim();
  return compact.length >= 4 && JAPANESE_TEXT.test(compact);
}

export function answerSafeInspectableTerms(input: {
  enabled: boolean;
  prompt: string;
  correctAnswer: string;
  targetItemIds: string[];
  terms: StoryWord[];
}): StoryWord[] {
  if (!input.enabled) return [];

  const targetIds = new Set(input.targetItemIds);
  const answer = normalized(input.correctAnswer);
  return input.terms.filter((term, index, all) => {
    if (
      all.findIndex((candidate) => candidate.surface === term.surface) !== index
    ) {
      return false;
    }
    if (term.libraryId && targetIds.has(term.libraryId)) return false;

    // A word named in the instruction is normally the tested word. Keep it
    // plain even when the same word also appears in the context sentence.
    if (term.surface && input.prompt.includes(term.surface)) return false;

    const answerBearingValues = [term.surface, term.reading, term.meaning].map(
      normalized,
    );
    return !answer || !answerBearingValues.includes(answer);
  });
}
