import type { LessonPackage, LessonPhase } from "@/types/lesson";

export const CANONICAL_LESSON_PHASES = [
  {
    id: "story",
    label: "Story",
    description: "Meet today’s Japanese in context.",
  },
  {
    id: "vocabulary",
    label: "Words & kanji",
    description: "Build meaning and recognition.",
  },
  {
    id: "grammar",
    label: "Grammar",
    description: "Use the selected patterns.",
  },
  {
    id: "reading",
    label: "Reading",
    description: "Read closely and answer comprehension questions.",
  },
  {
    id: "listening",
    label: "Listening",
    description: "Listen for meaning.",
  },
  {
    id: "speaking",
    label: "Speaking",
    description: "Read each displayed sentence aloud.",
  },
] as const satisfies readonly LessonPhase[];

export const CANONICAL_LESSON_ACTIVITY_COUNTS = {
  vocabulary: 7,
  grammar: 7,
  reading: 5,
  listening: 5,
  speaking: 5,
  review: 0,
} as const;

const canonicalPhaseIds = CANONICAL_LESSON_PHASES.map((phase) => phase.id);

export function canonicalLessonPhases(): LessonPhase[] {
  return CANONICAL_LESSON_PHASES.map((phase) => ({ ...phase }));
}

export function normalizeLessonPhases(value: unknown): LessonPhase[] {
  if (!Array.isArray(value)) return canonicalLessonPhases();

  const byId = new Map<LessonPhase["id"], LessonPhase>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const id = source.id;
    if (!canonicalPhaseIds.includes(id as (typeof canonicalPhaseIds)[number])) continue;
    if (typeof source.label !== "string" || typeof source.description !== "string") continue;
    byId.set(id as LessonPhase["id"], {
      id: id as LessonPhase["id"],
      label: source.label,
      description: source.description,
    });
  }

  return CANONICAL_LESSON_PHASES.map((phase) => ({
    ...(byId.get(phase.id) ?? phase),
    id: phase.id,
  }));
}

function splitMatches(values: string[], expected: Record<string, number>): boolean {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return Object.entries(expected).every(([key, count]) => (counts.get(key) ?? 0) === count);
}

function exactCountIssue(label: string, actual: number, expected: number): string[] {
  return actual === expected
    ? []
    : [`${label} must contain exactly ${expected} activities; found ${actual}.`];
}

export function lessonContractIssues(lesson: LessonPackage): string[] {
  const issues: string[] = [];
  const phaseIds = lesson.phases.map((phase) => phase.id);
  const currentPhases =
    phaseIds.length === canonicalPhaseIds.length &&
    phaseIds.every((id, index) => id === canonicalPhaseIds[index]);
  if (!currentPhases) issues.push(`Lesson phases must be ${canonicalPhaseIds.join(" → ")}.`);

  if (!lesson.story.length) issues.push("Story must not be empty.");
  if (!lesson.grammar.length) issues.push("Grammar must not be empty.");
  if (!lesson.readingConversation.length) issues.push("Reading passage must not be empty.");

  issues.push(...exactCountIssue(
    "Vocabulary practice",
    lesson.vocabularyQuestions.length,
    CANONICAL_LESSON_ACTIVITY_COUNTS.vocabulary,
  ));
  issues.push(...exactCountIssue(
    "Grammar practice",
    lesson.grammarQuestions.length,
    CANONICAL_LESSON_ACTIVITY_COUNTS.grammar,
  ));
  issues.push(...exactCountIssue(
    "Reading questions",
    lesson.readingQuestions?.length ?? 0,
    CANONICAL_LESSON_ACTIVITY_COUNTS.reading,
  ));
  issues.push(...exactCountIssue(
    "Listening practice",
    lesson.listeningExercises.length,
    CANONICAL_LESSON_ACTIVITY_COUNTS.listening,
  ));
  issues.push(...exactCountIssue(
    "Speaking practice",
    lesson.speakingExercises.length,
    CANONICAL_LESSON_ACTIVITY_COUNTS.speaking,
  ));
  issues.push(...exactCountIssue(
    "Final review",
    lesson.reviewQuestions.length,
    CANONICAL_LESSON_ACTIVITY_COUNTS.review,
  ));

  if (!splitMatches(
    lesson.vocabularyQuestions.map((question) => question.difficulty),
    { Easy: 3, Medium: 2, Hard: 2 },
  )) {
    issues.push("Vocabulary practice must contain 3 Easy, 2 Medium, and 2 Hard questions.");
  }
  if (!splitMatches(
    lesson.grammarQuestions.map((question) => question.difficulty),
    { Easy: 3, Medium: 2, Hard: 2 },
  )) {
    issues.push("Grammar practice must contain 3 Easy, 2 Medium, and 2 Hard questions.");
  }
  if (!splitMatches(
    (lesson.readingQuestions ?? []).map((question) => question.difficulty),
    { easy: 2, medium: 2, hard: 1 },
  )) {
    issues.push("Reading practice must contain 2 easy, 2 medium, and 1 hard question.");
  }
  if (!splitMatches(
    lesson.speakingExercises.map((exercise) => exercise.mode),
    { easy: 2, medium: 2, hard: 1 },
  )) {
    issues.push("Speaking practice must contain 2 easy, 2 medium, and 1 hard sentence.");
  }

  if (lesson.speakingExercises.some((exercise) => exercise.questionType !== "read_aloud")) {
    issues.push("Every speaking activity must use read_aloud mode.");
  }

  const ids = [
    ...lesson.vocabularyQuestions.map((item) => item.id),
    ...lesson.grammarQuestions.map((item) => item.id),
    ...(lesson.readingQuestions ?? []).map((item) => item.id),
    ...lesson.listeningExercises.map((item) => item.id),
    ...lesson.speakingExercises.map((item) => item.id),
  ];
  if (ids.some((id) => !id.trim())) issues.push("Every lesson activity must have a non-empty id.");
  if (new Set(ids).size !== ids.length) issues.push("Lesson activity ids must be unique across all phases.");

  return [...new Set(issues)];
}

export function isCanonicalPlayableLesson(lesson: LessonPackage): boolean {
  return Boolean(lesson.id && lesson.title) && lessonContractIssues(lesson).length === 0;
}
