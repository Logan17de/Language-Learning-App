function grammarSegmentMatches(story: string, segment: string): boolean {
  if (story.includes(segment)) return true;

  // Grammar catalog entries describe the canonical form, while generated
  // stories may naturally use an equivalent polite or conversational form.
  // Keep these mappings narrow so validation still requires the target
  // construction rather than accepting a loosely related sentence.
  const equivalentPatterns: Record<string, RegExp> = {
    "ていない": /て(?:い)?(?:ない|ません)/u,
    "でいない": /で(?:い)?(?:ない|ません)/u,
  };

  const equivalent = equivalentPatterns[segment];
  return equivalent ? equivalent.test(story) : false;
}

export function storyUsesGrammarPattern(story: string, pattern: string): boolean {
  const alternatives = pattern
    .split(/[・/]/u)
    .map((alternative) => alternative
      .split(/[～〜]+/u)
      .map((part) => part.replace(/[\s（）()[\]［］]/gu, "").trim())
      .filter((part) => part.length >= 2))
    .filter((segments) => segments.length > 0);

  return alternatives.some((segments) =>
    segments.every((segment) => grammarSegmentMatches(story, segment)));
}
