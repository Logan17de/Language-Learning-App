import type { CanonicalLesson } from "@/lib/repositories/lesson-repository";
import { mapCanonicalLesson as mapBaseLesson } from "@/lib/repositories/lesson-mapper";
import type { LessonPackage } from "@/types/lesson";

function wordNeedsReading(surface: string, knownKanji: Set<string>): boolean {
  const characters = surface.match(/\p{Script=Han}/gu) ?? [];
  return characters.length > 0 && characters.some((character) => !knownKanji.has(character));
}

/**
 * Keeps shared lesson content reusable while adding learner-specific furigana
 * display at load time. Nothing user-specific is written into the lesson row.
 */
export function mapCanonicalLesson(value: CanonicalLesson): LessonPackage {
  const lesson = mapBaseLesson(value);
  const knownKanji = new Set(value.knownKanji);
  return {
    ...lesson,
    story: lesson.story.map((line) => ({
      ...line,
      words: line.words.map((word) => ({
        ...word,
        showReading:
          word.scriptType === "kanji" &&
          wordNeedsReading(word.surface, knownKanji),
      })),
    })),
  };
}
