import type { LessonPackage } from "@/types/lesson";

export type AssignmentMode = "free_random" | "pro_interest" | "pro_custom";

export interface LessonAssignment {
  lesson: LessonPackage;
  mode: AssignmentMode;
  interestMatches: string[];
}

function normalized(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

export function selectNextLesson({
  lessons,
  level,
  interests,
  premium,
  excludedLessonIds,
  seed,
}: {
  lessons: LessonPackage[];
  level: LessonPackage["level"];
  interests: string[];
  premium: boolean;
  excludedLessonIds: string[];
  seed: string;
}): LessonAssignment | null {
  const excluded = new Set(excludedLessonIds);
  const eligible = lessons.filter(
    (lesson) =>
      lesson.status === "published" &&
      lesson.level === level &&
      !excluded.has(lesson.id),
  );
  if (!eligible.length) return null;

  const learnerInterests = normalized(interests);
  if (!premium || learnerInterests.length === 0) {
    return {
      lesson: eligible[stableIndex(seed, eligible.length)],
      mode: "free_random",
      interestMatches: [],
    };
  }

  const ranked = eligible
    .map((lesson) => {
      const lessonSignals = normalized([lesson.topic, ...(lesson.tags ?? [])]);
      const interestMatches = learnerInterests.filter((interest) =>
        lessonSignals.some(
          (signal) => signal.includes(interest) || interest.includes(signal),
        ),
      );
      return { lesson, interestMatches };
    })
    .sort(
      (a, b) =>
        Number(b.lesson.source === "user_generated") -
          Number(a.lesson.source === "user_generated") ||
        b.interestMatches.length - a.interestMatches.length ||
        a.lesson.id.localeCompare(b.lesson.id),
    );

  return {
    ...ranked[0],
    mode: "pro_interest",
  };
}
