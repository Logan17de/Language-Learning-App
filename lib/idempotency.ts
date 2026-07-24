export function dedupeByKey<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function completionKey(lessonId: string, completedAt: string): string {
  return `${lessonId}:${new Date(completedAt).toISOString()}`;
}
