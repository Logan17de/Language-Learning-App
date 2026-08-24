import type { AdminLessonDraft } from "@/types/admin";
import type { LessonPackage } from "@/types/lesson";
import { CANONICAL_LESSON_PHASES } from "@/lib/lesson-contract";

export function validateAdminLesson(lesson: LessonPackage): AdminLessonDraft {
  const errors: Record<string, string> = {};
  if (lesson.title.trim().length < 3) errors.title = "Enter a title with at least 3 characters.";
  if (lesson.japaneseTitle.trim().length < 1) errors.japaneseTitle = "Japanese title is required.";
  if (lesson.summary.trim().length < 12) errors.summary = "Description must be at least 12 characters.";
  if (lesson.topic.trim().length < 2) errors.topic = "Topic is required.";
  if (lesson.durationMinutes < 5 || lesson.durationMinutes > 120) errors.durationMinutes = "Duration must be between 5 and 120 minutes.";
  if (!lesson.grammar.length) errors.grammar = "At least one grammar point is required.";
  if (!lesson.kanji.length) errors.kanji = "At least one kanji item is required.";
  if (!lesson.vocabulary.length) errors.vocabulary = "At least one vocabulary item is required.";
  if (!lesson.story.length) errors.story = "The story phase cannot be empty.";
  if (lesson.story.some((line) => !line.japanese.trim() || !line.english.trim())) errors.storyLines = "Every story line needs Japanese and English text.";
  if (!lesson.vocabularyQuestions.length) errors.vocabularyQuestions = "Vocabulary practice is required.";
  if (!lesson.grammarQuestions.length) errors.grammarQuestions = "Grammar practice is required.";
  if (!lesson.readingConversation.length) errors.reading = "Reading dialogue is required.";
  if (!(lesson.readingQuestions?.length)) errors.readingQuestions = "Reading questions are required.";
  if (!lesson.listeningExercises.length) errors.listening = "At least one listening exercise is required.";
  if (!lesson.speakingExercises.length) errors.speaking = "At least one speaking exercise is required.";

  const ids = [
    ...lesson.story.map((item) => item.id),
    ...lesson.grammar.map((item) => item.id),
    ...lesson.vocabularyQuestions.map((item) => item.id),
    ...lesson.grammarQuestions.map((item) => item.id),
    ...(lesson.readingQuestions ?? []).map((item) => item.id),
    ...lesson.listeningExercises.map((item) => item.id),
    ...lesson.speakingExercises.map((item) => item.id),
  ];
  if (new Set(ids).size !== ids.length) errors.ids = "Activity IDs must be unique across the lesson.";

  const canonicalIds = CANONICAL_LESSON_PHASES.map((phase) => phase.id);
  const phaseIds = lesson.phases.map((phase) => phase.id);
  if (
    phaseIds.length !== canonicalIds.length ||
    !phaseIds.every((id, index) => id === canonicalIds[index])
  ) {
    errors.phases = "All six lesson phases are required in canonical order.";
  }

  return { lesson, valid: Object.keys(errors).length === 0, errors };
}
