import "server-only";

import { buildInteractiveStory } from "@/lib/gemini/lesson-activity-groups";
import type {
  ResolvedLessonLibrary,
  StoryDraft,
} from "@/lib/gemini/lesson-engine-v2";

export function buildInteractiveStoryForLearner(
  draft: StoryDraft,
  library: ResolvedLessonLibrary,
) {
  return buildInteractiveStory(draft, library);
}
