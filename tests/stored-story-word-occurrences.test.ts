import { describe, expect, it } from "vitest";
import { segmentStoredStoryLine } from "@/lib/story-support";
import type { StoryWord } from "@/types/lesson";

function word(
  id: string,
  surface: string,
  position: number,
): StoryWord {
  return {
    id,
    libraryId: id,
    libraryType: "vocabulary",
    position,
    surface,
    reading: surface,
    meaning: surface,
    scriptType: "kanji",
    baseMeaningScore: 0,
    baseRecognitionScore: 0,
    basePronunciationScore: 0,
  };
}

describe("stored story word occurrences", () => {
  it("makes every repeated occurrence tappable from one library record", () => {
    const segments = segmentStoredStoryLine("公園から公園へ", [
      word("park", "公園", 1),
    ]);

    expect(segments.filter((segment) => segment.word?.id === "park")).toHaveLength(2);
  });

  it("prefers the longest library term when entries overlap", () => {
    const segments = segmentStoredStoryLine("日本語", [
      word("japan", "日本", 1),
      word("japanese", "日本語", 2),
    ]);

    expect(segments).toEqual([{ text: "日本語", word: expect.objectContaining({ id: "japanese" }) }]);
  });
});
