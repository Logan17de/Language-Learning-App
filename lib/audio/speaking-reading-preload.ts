type ReadingHintRequest = {
  accountId: string | null;
  exerciseId: string;
};

const readingHints = new Map<string, Promise<string>>();

function cacheKey({ accountId, exerciseId }: ReadingHintRequest): string {
  return `${accountId ?? "unscoped"}:${exerciseId}`;
}

/**
 * Reading hints are deterministic for a stored speaking sentence. Sharing the
 * promise lets Listening warm question one and lets Speaking consume that same
 * request, then stay exactly one question ahead without duplicate fetches.
 */
export function preloadSpeakingReadingHint(
  input: ReadingHintRequest,
): Promise<string> {
  const key = cacheKey(input);
  const cached = readingHints.get(key);
  if (cached) return cached;

  const pending = fetch(
    `/api/audio/reading?exerciseId=${encodeURIComponent(input.exerciseId)}`,
  )
    .then(async (response) => {
      const result: unknown = await response.json().catch(() => null);
      const record =
        result && typeof result === "object" && !Array.isArray(result)
          ? (result as Record<string, unknown>)
          : null;
      if (!response.ok || typeof record?.romaji !== "string") {
        throw new Error(
          typeof record?.error === "string"
            ? record.error
            : "The reading hint could not be prepared.",
        );
      }
      return record.romaji;
    })
    .catch((error) => {
      readingHints.delete(key);
      throw error;
    });
  readingHints.set(key, pending);
  return pending;
}
