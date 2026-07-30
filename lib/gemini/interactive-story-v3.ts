import "server-only";

import { buildInteractiveStory } from "@/lib/gemini/lesson-activity-groups";
import type {
  InspectableTerm,
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";

export type LearnerInspectableTerm = InspectableTerm & {
  /** Show the kana beside this story word without requiring a tap. */
  showReading: boolean;
};

function containsUnknownKanji(
  surface: string,
  knownKanji: Set<string>,
): boolean {
  const characters = surface.match(/\p{Script=Han}/gu) ?? [];
  return (
    characters.length > 0 &&
    characters.some((character) => !knownKanji.has(character))
  );
}

export function buildInteractiveStoryForLearner(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
  knownKanjiValues: string[],
) {
  const story = buildInteractiveStory(draft, library);
  const knownKanji = new Set(knownKanjiValues);
  return {
    ...story,
    lines: story.lines.map((line) => ({
      ...line,
      words: line.words.map((word): LearnerInspectableTerm => {
        const showReading = containsUnknownKanji(word.surface, knownKanji);
        return {
          ...word,
          showReading,
          // The current custom-topic preview normalizer preserves libraryType
          // but not new optional fields. Use this preview-only marker so the
          // first returned story also displays unknown readings immediately.
          // Stored lessons retain the original canonical library type.
          ...(showReading ? { libraryType: "kanji" as const } : {}),
        };
      }),
    })),
  };
}
