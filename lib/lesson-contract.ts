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
  {
    id: "review",
    label: "Final review",
    description: "Retrieve the lesson without hints.",
  },
] as const satisfies readonly LessonPhase[];

/** Current activity-bank sizes for newly generated lessons. */
export const CANONICAL_LESSON_ACTIVITY_COUNTS = {
  vocabulary: 7,
  grammar: 7,
  reading: 7,
  listening: 7,
  speaking: 7,
  review: 5,
} as const;

/**
 * Existing curated/generated lessons were published with the older bank sizes.
 * They stay playable during the transition; new generation uses the current
 * seven-question contract above.
 */
const LEGACY_LESSON_ACTIVITY_COUNTS = {
  vocabulary: 13,
  grammar: 10,
  reading: 5,
  listening: 5,
  speaking: 5,
  review: 5,
} as const;

const canonicalPhaseIds = CANONICAL_LESSON_PHASES.map((phase) => phase.id);
const canonicalReviewCategories = [
  "kanji",
  "vocabulary",
  "grammar",
  "listening",
  "speaking",
] as const;

export function canonicalLessonPhases(): LessonPhase[] {
  return CANONICAL_LESSON_PHASES.map((phase) => ({ ...phase }));
}

/**
 * Phase order is a product contract, not lesson-authored content. Existing
 * stored labels/descriptions may be reused by id, but their order can never
 * change the learner flow.
 */
export function normalizeLessonPhases(value: unknown): LessonPhase[] {
  if (!Array.isArray(value)) return canonicalLessonPhases();

  const byId = new Map<LessonPhase["id"], LessonPhase>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const source = item as Record<string, unknown>;
    const id = source.id;
    if (!canonicalPhaseIds.includes(id as LessonPhase["id"])) continue;
    if (
      typeof source.label !== "string" ||
      typeof source.description !== "string"
    ) {
      continue;
    }
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

function splitMatches(
  values: string[],
  expected: Record<string, number>,
): boolean {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.entries(expected).every(
    ([key, count]) => (counts.get(key) ?? 0) === count,
  );
}

function currentOrLegacyCount(
  actual: number,
  current: number,
  legacy: number,
): boolean {
  return actual === current || actual === legacy;
}

function currentOrLegacySplit(
  values: string[],
  current: Record<string, number>,
  legacy: Record<string, number>,
): boolean {
  return splitMatches(values, current) || splitMatches(values, legacy);
}

export function lessonContractIssues(lesson: LessonPackage): string[] {
  const issues: string[] = [];
  const phaseIds = lesson.phases.map((phase) => phase.id);

  if (
    phaseIds.length !== canonicalPhaseIds.length ||
    phaseIds.some((id, index) => id !== canonicalPhaseIds[index])
  ) {
    issues.push(`Lesson phases must be ${canonicalPhaseIds.join(" → ")}.`);
  }

  if (!lesson.story.length) issues.push("Story must not be empty.");
  if (!lesson.vocabulary.length) issues.push("Vocabulary must not be empty.");
  if (!lesson.grammar.length) issues.push("Grammar must not be empty.");

  const exactBanks: Array<[string, number, number, number]> = [
    [
      "Vocabulary practice",
      lesson.vocabularyQuestions.length,
      CANONICAL_LESSON_ACTIVITY_COUNTS.vocabulary,
      LEGACY_LESSON_ACTIVITY_COUNTS.vocabulary,
    ],
    [
      "Grammar practice",
      lesson.grammarQuestions.length,
      CANONICAL_LESSON_ACTIVITY_COUNTS.grammar,
      LEGACY_LESSON_ACTIVITY_COUNTS.grammar,
    ],
    [
      "Reading questions",
      lesson.readingQuestions?.length ?? 0,
      CANONICAL_LESSON_ACTIVITY_COUNTS.reading,
      LEGACY_LESSON_ACTIVITY_COUNTS.reading,
    ],
    [
      "Listening practice",
      lesson.listeningExercises.length,
      CANONICAL_LESSON_ACTIVITY_COUNTS.listening,
      LEGACY_LESSON_ACTIVITY_COUNTS.listening,
    ],
    [
      "Speaking practice",
      lesson.speakingExercises.length,
      CANONICAL_LESSON_ACTIVITY_COUNTS.speaking,
      LEGACY_LESSON_ACTIVITY_COUNTS.speaking,
    ],
    [
      "Final review",
      lesson.reviewQuestions.length,
      CANONICAL_LESSON_ACTIVITY_COUNTS.review,
      LEGACY_LESSON_ACTIVITY_COUNTS.review,
    ],
  ];
  for (const [label, actual, current, legacy] of exactBanks) {
    if (!currentOrLegacyCount(actual, current, legacy)) {
      issues.push(
        current === legacy
          ? `${label} must contain exactly ${current} activities; found ${actual}.`
          : `${label} must contain ${current} current-format or ${legacy} legacy activities; found ${actual}.`,
      );
    }
  }

  if (
    !currentOrLegacySplit(
      lesson.vocabularyQuestions.map((question) => question.difficulty),
      { Easy: 3, Medium: 2, Hard: 2 },
      { Easy: 6, Medium: 4, Hard: 3 },
    )
  ) {
    issues.push("Vocabulary practice must use the current 3 Easy / 2 Medium / 2 Hard split or the legacy 6 / 4 / 3 split.");
  }
  if (
    !currentOrLegacySplit(
      lesson.grammarQuestions.map((question) => question.difficulty),
      { Easy: 3, Medium: 2, Hard: 2 },
      { Easy: 3, Medium: 4, Hard: 3 },
    )
  ) {
    issues.push("Grammar practice must use the current 3 Easy / 2 Medium / 2 Hard split or the legacy 3 / 4 / 3 split.");
  }
  if (
    !currentOrLegacySplit(
      (lesson.readingQuestions ?? []).map((question) => question.difficulty),
      { easy: 3, medium: 2, hard: 2 },
      { easy: 2, medium: 2, hard: 1 },
    )
  ) {
    issues.push("Reading practice must use the current 3 easy / 2 medium / 2 hard split or the legacy 2 / 2 / 1 split.");
  }
  if (
    !currentOrLegacySplit(
      lesson.speakingExercises.map((exercise) => exercise.mode),
      { easy: 3, medium: 2, hard: 2 },
      { easy: 2, medium: 2, hard: 1 },
    )
  ) {
    issues.push("Speaking practice must use the current 3 easy / 2 medium / 2 hard split or the legacy 2 / 2 / 1 split.");
  }

  if (!lesson.readingConversation.length) {
    issues.push("Reading passage must not be empty.");
  }

  if (
    lesson.speakingExercises.some(
      (exercise) => exercise.questionType !== "read_aloud",
    )
  ) {
    issues.push("Every speaking activity must use read_aloud mode.");
  }

  const reviewCategories = lesson.reviewQuestions.map(
    (question) => question.category,
  );
  for (const category of canonicalReviewCategories) {
    if (reviewCategories.filter((value) => value === category).length !== 1) {
      issues.push(`Final review must contain exactly one ${category} question.`);
    }
  }

  const ids = [
    ...lesson.vocabularyQuestions.map((item) => item.id),
    ...lesson.grammarQuestions.map((item) => item.id),
    ...(lesson.readingQuestions ?? []).map((item) => item.id),
    ...lesson.listeningExercises.map((item) => item.id),
    ...lesson.speakingExercises.map((item) => item.id),
    ...lesson.reviewQuestions.map((item) => item.id),
  ];
  if (ids.some((id) => !id.trim())) {
    issues.push("Every lesson activity must have a non-empty id.");
  }
  if (new Set(ids).size !== ids.length) {
    issues.push("Lesson activity ids must be unique across all phases.");
  }

  return [...new Set(issues)];
}

export function isCanonicalPlayableLesson(lesson: LessonPackage): boolean {
  return (
    Boolean(lesson.id && lesson.title) && lessonContractIssues(lesson).length === 0
  );
}
