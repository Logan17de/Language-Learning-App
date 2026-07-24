import type { AdminLessonDraft } from "@/types/admin";
import type { LessonPackage } from "@/types/lesson";

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
  if (lesson.story.some((line) => !line.japanese.trim() || !line.english.trim())) errors.storyLines = "Every story line needs Japanese and a translation.";
  if (!lesson.readingConversation.length) errors.reading = "Reading dialogue is required.";
  if (!lesson.listeningExercises.length) errors.listening = "At least one listening exercise is required.";
  if (!lesson.speakingExercises.length) errors.speaking = "At least one speaking exercise is required.";
  if (!lesson.reviewQuestions.length) errors.review = "At least one final review question is required.";
  if (lesson.reviewQuestions.some((question) => !question.choices.includes(question.correctAnswer))) errors.answerKeys = "Each correct review answer must appear in its options.";
  const ids = [
    ...lesson.story.map((item) => item.id),
    ...lesson.grammar.map((item) => item.id),
    ...lesson.listeningExercises.map((item) => item.id),
    ...lesson.speakingExercises.map((item) => item.id),
    ...lesson.reviewQuestions.map((item) => item.id),
  ];
  if (new Set(ids).size !== ids.length) errors.ids = "Activity IDs must be unique across the lesson.";
  if (lesson.phases.length !== 7) errors.phases = "All seven lesson phases are required.";
  if (!lesson.answerKeys.length) errors.answerKeys = "Answer keys are required.";
  return { lesson, valid: Object.keys(errors).length === 0, errors };
}
