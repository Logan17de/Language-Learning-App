const GRAMMAR_PLACEHOLDER = /^(?:N|V|A|Na|iA|なA|いA|Plain|普通形|辞書形|文)$/iu;

function normalizedGrammarText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, "");
}

function grammarSegmentMatchEnd(
  story: string,
  segment: string,
  start: number,
): number | null {
  const suffix = story.slice(start);
  const directIndex = suffix.indexOf(segment);
  if (directIndex >= 0) return start + directIndex + segment.length;

  // Grammar catalog entries describe the canonical form, while generated
  // stories may naturally use an equivalent polite or conversational form.
  // Keep these mappings narrow so validation still requires the target
  // construction rather than accepting a loosely related sentence.
  const equivalentPatterns: Record<string, RegExp> = {
    "ていない": /て(?:い)?(?:ない|ません)/u,
    "でいない": /で(?:い)?(?:ない|ません)/u,
  };

  const equivalent = equivalentPatterns[segment];
  if (!equivalent) return null;
  const match = equivalent.exec(suffix);
  return match?.index === undefined
    ? null
    : start + match.index + match[0].length;
}

function grammarAlternativeSegments(alternative: string): string[] {
  const raw = alternative
    .normalize("NFKC")
    .split(/[～〜~+＋]+/u)
    .map((part) =>
      part
        .replace(/[\s（）()[\]［］【】{}]/gu, "")
        .trim(),
    )
    .filter(Boolean)
    .filter((part) => !GRAMMAR_PLACEHOLDER.test(part));

  if (raw.length > 1) return raw;
  // A one-character Japanese grammar marker such as ～ば is still a real
  // target. Keeping it is preferable to treating the pattern as unverifiable.
  return raw.filter((part) => part.length >= 2 || /[ぁ-んァ-ヶ一-龯]/u.test(part));
}

export function storyUsesGrammarPattern(story: string, pattern: string): boolean {
  const normalizedStory = normalizedGrammarText(story);
  const alternatives = pattern
    .split(/[・/／|｜]/u)
    .map(grammarAlternativeSegments)
    .filter((segments) => segments.length > 0);

  return alternatives.some((segments) => {
    let cursor = 0;
    for (const rawSegment of segments) {
      const segment = normalizedGrammarText(rawSegment);
      const end = grammarSegmentMatchEnd(normalizedStory, segment, cursor);
      if (end === null) return false;
      cursor = end;
    }
    return true;
  });
}
