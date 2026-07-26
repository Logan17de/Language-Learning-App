export function storyUsesGrammarPattern(story: string, pattern: string): boolean {
  const alternatives = pattern
    .split(/[・/]/u)
    .map((alternative) => alternative
      .split(/[～〜]+/u)
      .map((part) => part.replace(/[\s（）()[\]［］]/gu, "").trim())
      .filter((part) => part.length >= 2))
    .filter((segments) => segments.length > 0);

  return alternatives.some((segments) =>
    segments.every((segment) => story.includes(segment)));
}
