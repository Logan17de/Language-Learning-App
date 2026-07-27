import type { StoryWord } from "@/types/lesson";
import type { LessonSession, StoryInteraction } from "@/types/lesson-session";
import {
  STORY_MEANING_PENALTY,
  STORY_RECOGNITION_PENALTY,
} from "@/lib/story-support";

export function appendInspectableInteraction(
  session: LessonSession,
  activityId: string,
  word: StoryWord,
  reveal: "reading" | "meaning",
): LessonSession {
  const kana = word.scriptType !== "kanji";
  const recognitionDelta =
    reveal === "reading"
      ? -STORY_RECOGNITION_PENALTY
      : kana
        ? -STORY_MEANING_PENALTY
        : 0;
  const meaningDelta = reveal === "meaning" ? -STORY_MEANING_PENALTY : 0;
  const interaction: StoryInteraction = {
    id: `support_${activityId}_${word.id}_${session.storyInteractions.length + 1}`,
    lineId: activityId,
    wordId: word.id,
    term: word.surface,
    type: reveal === "reading" ? "reading-revealed" : "meaning-revealed",
    scoreDelta: recognitionDelta + meaningDelta,
    meaningDelta,
    recognitionDelta,
    pronunciationDelta: 0,
    script: kana ? "kana" : "kanji",
  };
  return {
    ...session,
    storyInteractions: [...session.storyInteractions, interaction],
    updatedAt: new Date().toISOString(),
  };
}
