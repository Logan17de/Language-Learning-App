function sentences(value: string, japanese: boolean): string[] {
  const matcher = japanese
    ? /[^。！？!?]+[。！？!?]?/gu
    : /[^.!?]+[.!?]?/gu;
  return (value.match(matcher) ?? [value])
    .map((item) => item.normalize("NFKC").trim())
    .filter(Boolean);
}

export function partitionNonEmptySentences(
  items: string[],
  requestedCount: number,
  separator = "",
): string[] {
  const normalized = items.map((item) => item.normalize("NFKC").trim()).filter(Boolean);
  if (normalized.length < 1) return [];
  const count = Math.max(1, Math.min(Math.round(requestedCount), normalized.length));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * normalized.length) / count);
    const end = Math.floor(((index + 1) * normalized.length) / count);
    return normalized.slice(start, Math.max(start + 1, end)).join(separator).trim();
  }).filter(Boolean);
}

export function partitionReadingPassage(input: {
  japanese: string;
  english: string;
  maximumLines?: number;
}): Array<{ japanese: string; english: string }> {
  const japaneseSentences = sentences(input.japanese, true);
  const englishSentences = sentences(input.english, false);
  const count = Math.min(input.maximumLines ?? 6, japaneseSentences.length);
  const japanese = partitionNonEmptySentences(japaneseSentences, count);
  const english = partitionNonEmptySentences(englishSentences, count, " ");
  const englishFallback = input.english.normalize("NFKC").trim();
  return japanese.map((line, index) => ({
    japanese: line,
    english: english[index] || english[Math.min(index, english.length - 1)] || englishFallback,
  }));
}
