function seedHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    left.every((choice, index) => choice === right[index]);
}

/**
 * Reorders a model-provided choice bank once during deterministic lesson
 * assembly. The seed keeps the stored order stable across retries and reloads.
 */
export function shuffledChoices(
  choices: readonly string[],
  seed: string,
): string[] {
  const shuffled = [...choices];
  if (shuffled.length < 2) return shuffled;

  let state = seedHash(seed || shuffled.join("\u0000"));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  if (!sameOrder(shuffled, choices)) return shuffled;

  // A valid Fisher-Yates result can occasionally equal the input. Rotate the
  // list so a distinct model-provided bank is always presented differently.
  for (let offset = 1; offset < shuffled.length; offset += 1) {
    const rotated = [...shuffled.slice(offset), ...shuffled.slice(0, offset)];
    if (!sameOrder(rotated, choices)) return rotated;
  }
  return shuffled;
}
